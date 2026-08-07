class MarketDataUnavailable(Exception):
    """A symbol's price data could not be fetched or refreshed (provider error)."""

    def __init__(self, symbol: str, reason: str):
        self.symbol = symbol
        self.reason = reason
        super().__init__(f"{symbol}: {reason}")


class SymbolNotFound(Exception):
    """A symbol does not exist / has no price history at all."""

    def __init__(self, symbol: str):
        self.symbol = symbol
        super().__init__(f"Unknown symbol: {symbol}")
