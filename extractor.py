import pandas as pd
from model import Loan
from calculator import Amortization


class Extractor:

    def __init__(self, input_path, output_path, sheet_name):
        self.input_path = input_path
        self.output_path = output_path
        self.sheet_name = sheet_name

    # -------------------------
    # 1. Read Excel
    # -------------------------
    def read_data(self):
        self.df = pd.read_excel(self.input_path, sheet_name=self.sheet_name)
        return self.df

    # -------------------------
    # Core processor
    # -------------------------
    def _process_amount(self, value_type):

        results = []

        for _, row in self.df.iterrows():

            loan = Loan(
                reporting_date=row["Reporting Date"],
                account_id=row["Account ID"],
                currency=row["CCY"],
                outstanding=row["Outstanding"],
                interest_rate=row["Interest Rate"],
                start_date=row["Start Date"],
                end_date=row["End Date"],
                installment=str(row["Installment"]) if pd.notna(row["Installment"]) else "no",
                product_type=row.get("ProductType"),
                segment=row.get("Segment"),
                daerah=row.get("Daerah"),
                postal_code=row.get("KodePos"),
                insured_or_uninsured=row.get("Insured/Uninsured"),
                transactional_or_non_transactional=row.get("Transactional/Non Transactional"),
                method=row.get("Method", "annuity")
            )

            amort = Amortization(loan)

            # --- get each bucket ---
            lcr = amort.get_bucket_lcr_flat(value_type)
            nsfr = amort.get_bucket_nsfr_flat(value_type)
            irrbb = amort.get_bucket_irrbb_flat(value_type)

            remaining_days = (loan.end_date - loan.reporting_date).days
            
            combined = pd.concat([lcr, nsfr, irrbb], axis=1)
            combined.insert(0, "account_id", loan.account_id)
            combined.insert(1, "remaining_days_to_maturity", remaining_days)
            
            results.append(combined)

        return pd.concat(results, ignore_index=True)

    # -------------------------
    # 2. Process loans
    # -------------------------
    def process(self):

        self.principal_df = self._process_amount("principal")
        self.interest_df = self._process_amount("interest")

    # -------------------------
    # 3. Write Excel (2 sheets)
    # -------------------------
    def write_output(self):

        with pd.ExcelWriter(self.output_path, engine="openpyxl") as writer:
            self.principal_df.to_excel(
                writer,
                sheet_name="Principal",
                index=False
            )

            self.interest_df.to_excel(
                writer,
                sheet_name="Interest",
                index=False
            )
