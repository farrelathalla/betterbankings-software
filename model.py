import pandas as pd

class Loan:
    def __init__(
        self,
        reporting_date,
        account_id,
        currency,
        outstanding,
        interest_rate,
        start_date,
        end_date,
        installment,
        method,
        product_type=None,
        segment=None,
        daerah=None,
        postal_code=None,
        insured_or_uninsured=None,
        transactional_or_non_transactional=None
    ):
        self.reporting_date = pd.to_datetime(reporting_date)
        self.account_id = account_id
        self.currency = currency
        self.outstanding = outstanding
        self.interest_rate = interest_rate
        self.start_date = pd.to_datetime(start_date)
        self.end_date = pd.to_datetime(end_date)
        self.installment = installment
        self.method = method
        self.product_type = product_type
        self.segment = segment
        self.daerah = daerah
        self.postal_code = postal_code
        self.insured_or_uninsured = insured_or_uninsured
        self.transactional_or_non_transactional = transactional_or_non_transactional

    @property
    def tenor_days(self):
        return (self.end_date - self.reporting_date).days

    @property
    def tenor_months(self):
        return (self.end_date.year - self.reporting_date.year)*12 + \
               (self.end_date.month - self.reporting_date.month)
    