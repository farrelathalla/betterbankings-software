import numpy_financial as npf
import pandas as pd
import numpy as np
import calendar
from model import Loan
from bucket import BucketIRRBB, BucketLCR, BucketNSFR

class Amortization:

    def __init__(self, loan: Loan):
        self.loan = loan

    # Payment dates generator
    def generate_payment_dates(self, reporting_date, end_date):
        reporting_date = pd.to_datetime(reporting_date)
        end_date = pd.to_datetime(end_date)

        anchor_day = end_date.day

        # Determine first month/year to start
        year = reporting_date.year
        month = reporting_date.month

        # Move to next month if needed
        if reporting_date.day >= anchor_day:
            month += 1
            if month > 12:
                month = 1
                year += 1

        dates = []

        while True:
            # Get last day of current month
            last_day = calendar.monthrange(year, month)[1]

            # Clamp only for that month
            day = min(anchor_day, last_day)

            d = pd.Timestamp(year=year, month=month, day=day)

            if d > end_date:
                break

            dates.append(d)

            # Move to next month manually
            month += 1
            if month > 12:
                month = 1
                year += 1

        return dates

    def _empty_bucket_result(self, bucket_type="irrbb"):

        if bucket_type == "irrbb":
            labels = ["≤ 1 bulan"] + BucketIRRBB.MONTH_LABELS

        elif bucket_type == "lcr":
            labels = ["≤30D", ">30D"]

        elif bucket_type == "nsfr":
            labels = ["<6M", "6-12M", ">12M"]

        else:
            raise ValueError("Unknown bucket_type")

        return pd.DataFrame({
            "bucket": labels,
            "value": [0]*len(labels)
        })

    # -------------------------
    # Schedule
    # -------------------------
    def schedule(self):

        principal = self.loan.outstanding
        annual_rate = self.loan.interest_rate
        method = self.loan.method.lower()
        installment = self.loan.installment.lower()

        reporting_date = self.loan.reporting_date
        end_date = self.loan.end_date

        payment_dates = self.generate_payment_dates(reporting_date, end_date)
        periods = len(payment_dates)

        if end_date <= reporting_date:
            return pd.DataFrame()
        
        # if periods <= 0:
        #     raise ValueError("No payment periods found")

        rows = []

        r = annual_rate / 12
        balance = principal

        # =====================================
        # INSTALLMENT = NO (Bullet structure)
        # =====================================
        if installment == "no":

            monthly_interest = principal * r

            for i, pay_date in enumerate(payment_dates, start=1):

                # Principal only paid at final period
                if i == periods:
                    principal_payment = principal
                else:
                    principal_payment = 0

                interest = monthly_interest
                payment = principal_payment + interest

                balance -= principal_payment

                rows.append({
                    "period": i,
                    "payment_date": pay_date,
                    "payment": round(payment, 2),
                    "principal": round(principal_payment, 2),
                    "interest": round(interest, 2),
                    "remaining_balance": round(max(balance, 0), 2)
                })

            return pd.DataFrame(rows)

        # =====================================
        # INSTALLMENT = YES (Normal loans)
        # =====================================
        if installment == "yes":

            # ===== ANNUITY =====
            if method == "annuity":

                pmt = npf.pmt(r, periods, -principal) if r != 0 else principal / periods

                for i, pay_date in enumerate(payment_dates, start=1):

                    interest = balance * r
                    principal_payment = pmt - interest
                    balance -= principal_payment

                    rows.append({
                        "period": i,
                        "payment_date": pay_date,
                        "payment": round(pmt, 2),
                        "principal": round(principal_payment, 2),
                        "interest": round(interest, 2),
                        "remaining_balance": round(max(balance, 0), 2)
                    })

            # ===== FLAT =====
            elif method == "flat":

                monthly_principal = principal / periods
                monthly_interest = principal * r
                payment = monthly_principal + monthly_interest

                for i, pay_date in enumerate(payment_dates, start=1):

                    balance -= monthly_principal

                    rows.append({
                        "period": i,
                        "payment_date": pay_date,
                        "payment": round(payment, 2),
                        "principal": round(monthly_principal, 2),
                        "interest": round(monthly_interest, 2),
                        "remaining_balance": round(max(balance, 0), 2)
                    })

            else:
                raise ValueError("method must be 'annuity' or 'flat'")

        else:
            raise ValueError("installment must be 'yes' or 'no'")

        return pd.DataFrame(rows)



    # -------------------------
    # BUCKET - IRRBB
    # -------------------------
    def get_bucket_irrbb(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("irrbb")
        df = sched.copy()
        
        reporting_date = self.loan.reporting_date

        # -------------------------
        # Time differences
        # -------------------------
        df["days"] = (df["payment_date"] - reporting_date).dt.days

        df["months"] = (
            (df["payment_date"].dt.year - reporting_date.year) * 12 +
            (df["payment_date"].dt.month - reporting_date.month)
        )

        # -------------------------
        # Bucket logic
        # -------------------------
        df["bucket"] = None

        # ≤30 days
        mask_1m = df["days"] <= 30
        df.loc[mask_1m, "bucket"] = "≤ 1 bulan"

        # >30 days → month buckets
        df.loc[~mask_1m, "bucket"] = pd.cut(
            df.loc[~mask_1m, "months"],
            bins=BucketIRRBB.MONTH_EDGES,
            labels=BucketIRRBB.MONTH_LABELS,
            right=True,
            include_lowest=True
        ).astype(str)

        # -------------------------
        # Value selection
        # -------------------------
        if value_type == "principal":
            df["value"] = df["principal"]
        elif value_type == "interest":
            df["value"] = df["interest"]
        else:
            df["value"] = df["principal"] + df["interest"]

        # -------------------------
        # Aggregation
        # -------------------------
        all_labels = ["≤ 1 bulan"] + BucketIRRBB.MONTH_LABELS

        result = (
            df.groupby("bucket", observed=True)["value"]
            .sum()
            .reindex(all_labels, fill_value=0)
            .reset_index()
        )

        return result
    
    # -------------------------
    # BUCKET - LCR
    # -------------------------
    def get_bucket_lcr(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("lcr")
        df = sched.copy()
        
        reporting_date = self.loan.reporting_date

        # -------------------------
        # Day difference
        # -------------------------
        df["days"] = (df["payment_date"] - reporting_date).dt.days

        # -------------------------
        # Bucket logic
        # -------------------------
        df["bucket"] = np.where(
            df["days"] <= 30,
            "≤30D",
            ">30D"
        )

        # -------------------------
        # Value selection
        # -------------------------
        if value_type == "principal":
            df["value"] = df["principal"]
        elif value_type == "interest":
            df["value"] = df["interest"]
        else:
            df["value"] = df["principal"] + df["interest"]

        # -------------------------
        # Aggregation
        # -------------------------
        labels = ["≤30D", ">30D"]

        result = (
            df.groupby("bucket")["value"]
            .sum()
            .reindex(labels, fill_value=0)
            .reset_index()
        )

        return result
    
    # -------------------------
    # BUCKET - NSFR
    # -------------------------
    def get_bucket_nsfr(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("nsfr")
        df = sched.copy()
        
        reporting_date = self.loan.reporting_date

        # -------------------------
        # Month difference
        # -------------------------
        df["months"] = (
            (df["payment_date"].dt.year - reporting_date.year) * 12 +
            (df["payment_date"].dt.month - reporting_date.month)
        )

        # -------------------------
        # Bucket logic
        # -------------------------
        conditions = [
            df["months"] < 6,
            (df["months"] >= 6) & (df["months"] <= 12),
            df["months"] > 12
        ]

        choices = ["<6M", "6-12M", ">12M"]

        df["bucket"] = np.select(
            conditions,
            choices,
            default=">12M"
        )

        # -------------------------
        # Value selection
        # -------------------------
        if value_type == "principal":
            df["value"] = df["principal"]
        elif value_type == "interest":
            df["value"] = df["interest"]
        else:
            df["value"] = df["principal"] + df["interest"]

        # -------------------------
        # Aggregation
        # -------------------------
        result = (
            df.groupby("bucket")["value"]
            .sum()
            .reindex(choices, fill_value=0)
            .reset_index()
        )

        return result
    
    
    # Flattened bucket IRRBB
    def get_bucket_irrbb_flat(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("irrbb")
        df = sched.copy()
        
        reporting_date = self.loan.reporting_date

        df["days"] = (df["payment_date"] - reporting_date).dt.days

        df["months"] = (
            (df["payment_date"].dt.year - reporting_date.year) * 12 +
            (df["payment_date"].dt.month - reporting_date.month)
        )

        # Bucket logic
        df["bucket"] = None

        mask_1m = df["days"] <= 30
        df.loc[mask_1m, "bucket"] = "≤ 1 bulan"

        df.loc[~mask_1m, "bucket"] = pd.cut(
            df.loc[~mask_1m, "months"],
            bins=BucketIRRBB.MONTH_EDGES,
            labels=BucketIRRBB.MONTH_LABELS,
            right=True,
            include_lowest=True
        ).astype(str)

        # Value selection
        if value_type == "principal":
            df["value"] = df["principal"]
        elif value_type == "interest":
            df["value"] = df["interest"]
        else:
            df["value"] = df["principal"] + df["interest"]

        all_labels = ["≤ 1 bulan"] + BucketIRRBB.MONTH_LABELS

        result = (
            df.groupby("bucket", observed=True)["value"]
            .sum()
            .reindex(all_labels, fill_value=0)
            .to_frame()
            .T
        )

        return result

    # Flattened bucket LCR
    def get_bucket_lcr_flat(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("lcr")

        df = sched.copy()
        reporting_date = self.loan.reporting_date

        df["days"] = (df["payment_date"] - reporting_date).dt.days
        df["bucket"] = np.where(df["days"] <= 30, "≤30D", ">30D")

        if value_type == "principal":
            df["value"] = df["principal"]

        elif value_type == "interest":
            df["value"] = np.where(
                df["bucket"] == "≤30D",
                df["interest"],
                0
            )

        else:  # total
            df["value"] = df["principal"] + np.where(
                df["bucket"] == "≤30D",
                df["interest"],
                0
            )

        labels = ["≤30D", ">30D"]

        result = (
            df.groupby("bucket")["value"]
            .sum()
            .reindex(labels, fill_value=0)
            .to_frame()
            .T
        )

        return result

    # Flattened bucket NSFR
    def get_bucket_nsfr_flat(self, value_type="total"):

        sched = self.schedule()
        if sched is None or sched.empty:
            return self._empty_bucket_result("nsfr")
        df = sched.copy()
        
        reporting_date = self.loan.reporting_date

        df["months"] = (
            (df["payment_date"].dt.year - reporting_date.year) * 12 +
            (df["payment_date"].dt.month - reporting_date.month)
        )

        conditions = [
            df["months"] < 6,
            (df["months"] >= 6) & (df["months"] <= 12),
            df["months"] > 12
        ]

        choices = ["<6M", "6-12M", ">12M"]

        df["bucket"] = np.select(conditions, choices, default=">12M")

        if value_type == "principal":
            df["value"] = df["principal"]
        elif value_type == "interest":
            # df["value"] = df["interest"]
            df["value"] = 0
        else:
            df["value"] = df["principal"] + df["interest"]

        result = (
            df.groupby("bucket")["value"]
            .sum()
            .reindex(choices, fill_value=0)
            .to_frame()
        .T
    )

        return result