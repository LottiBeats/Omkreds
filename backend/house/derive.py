"""
house.derive — every derived fact carries its reason.

The engine must be able to answer "why does this beam have this span?" for every
number it produced (vision document §34).  That is only possible if the reason
travels with the value from the moment it is computed, so derived quantities are
wrapped in Derived rather than stored as bare floats.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class Derived(Generic[T]):
    """A value the engine worked out, together with how it worked it out.

    value   : the derived quantity, in the model's SI units
    reason  : one sentence, engineer-readable, shown verbatim in the UI
    sources : ids of the model objects the value was derived from
    """

    value: T
    reason: str
    sources: tuple[str, ...] = ()

    def __str__(self) -> str:  # pragma: no cover - display only
        return f"{self.value}  ({self.reason})"

    def to_dict(self) -> dict[str, Any]:
        return {"value": self.value, "reason": self.reason,
                "sources": list(self.sources)}


def derived(value: T, reason: str, *sources: str) -> Derived[T]:
    return Derived(value, reason, tuple(sources))


@dataclass
class Trace:
    """Ordered log of derivation steps, for the interpretation report."""

    entries: list[str] = field(default_factory=list)

    def add(self, message: str) -> None:
        self.entries.append(message)

    def __iter__(self):
        return iter(self.entries)

    def __len__(self) -> int:
        return len(self.entries)
