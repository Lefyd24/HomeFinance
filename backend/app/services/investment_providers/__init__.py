from app.services.investment_providers.base import (
    InvestmentProvider,
    ProviderBalance,
    ProviderNewsItem,
    ProviderNewsPage,
    ProviderPosition,
    ProviderSymbol,
    ProviderTransaction,
)
from app.services.investment_providers.freedom24 import Freedom24Provider

PROVIDERS: dict[str, type[InvestmentProvider]] = {
    "freedom24": Freedom24Provider,
}


def get_provider(
    provider_name: str, public_key: str, private_key: str, base_currency: str = "USD"
) -> InvestmentProvider:
    provider_cls = PROVIDERS.get(provider_name)
    if provider_cls is None:
        raise ValueError(f"Unsupported investment provider: {provider_name}")
    return provider_cls(public_key, private_key, base_currency)


__all__ = [
    "InvestmentProvider",
    "ProviderBalance",
    "ProviderNewsItem",
    "ProviderNewsPage",
    "ProviderPosition",
    "ProviderSymbol",
    "ProviderTransaction",
    "PROVIDERS",
    "get_provider",
]
