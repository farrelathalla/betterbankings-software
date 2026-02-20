import pandas as pd
import numpy as np

class BucketIRRBB:

    # Class-level config (IRRBB)
    MONTH_EDGES = [
        1, 3, 6, 9, 12,
        18, 24, 36, 48, 60,
        72, 84, 96, 108, 120,
        180, 240, np.inf
    ]

    MONTH_LABELS = [
        "1-3 bulan",
        "3-6 bulan",
        "6-9 bulan",
        "9-12 bulan",
        "1-1.5Y",
        "1.5-2Y",
        "2-3Y",
        "3-4Y",
        "4-5Y",
        "5-6Y",
        "6-7Y",
        "7-8Y",
        "8-9Y",
        "9-10Y",
        "10-15Y",
        "15-20Y",
        "> 20Y"
    ]

    def __init__(self, start_date, end_date):
        self.start_date = pd.to_datetime(start_date)
        self.end_date = pd.to_datetime(end_date)

    # ---------- Helpers ----------
    @property
    def days(self):
        return (self.end_date - self.start_date).days

    @property
    def months(self):
        return (
            (self.end_date.year - self.start_date.year) * 12 +
            (self.end_date.month - self.start_date.month)
        )

    # ---------- main logic ----------
    def get_bucket(self):
        # First bucket = day-based
        if self.days <= 30:
            return "≤ 1 bulan"

        # Rest = month-based
        m = self.months

        return pd.cut(
            [m],
            bins=self.MONTH_EDGES,
            labels=self.MONTH_LABELS
        )[0]
        
class BucketLCR:

    LABELS = ["≤30D", ">30D"]

    def __init__(self, reporting_date, end_date):
        self.reporting_date = pd.to_datetime(reporting_date)
        self.end_date = pd.to_datetime(end_date)

    @property
    def days(self):
        return (self.end_date - self.reporting_date).days

    def get_bucket(self):
        if self.days <= 30:
            return "≤30D"
        return ">30D"
    
    
class BucketNSFR:

    LABELS = ["<6M", "6-12M", ">12M"]

    def __init__(self, reporting_date, end_date):
        self.reporting_date = pd.to_datetime(reporting_date)
        self.end_date = pd.to_datetime(end_date)

    @property
    def months(self):
        return (
            (self.end_date.year - self.reporting_date.year) * 12 +
            (self.end_date.month - self.reporting_date.month)
        )

    def get_bucket(self):
        m = self.months

        if m < 6:
            return "<6M"
        elif m <= 12:
            return "6-12M"
        else:
            return ">12M"