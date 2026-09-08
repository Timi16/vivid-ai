from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ApiKeyCreate(BaseModel):
    # What the key is for, shown in the key list. The only thing the owner
    # will have to tell them apart by once the secret is gone.
    name: str = Field(min_length=1, max_length=128)


class ApiKeyOut(BaseModel):
    """A key as it can safely be listed: everything except the secret."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    #: The first characters of the key, e.g. `vivid_A1b2C3d4`. Enough to
    #: match a key against the one in a config file, useless on its own.
    prefix: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class ApiKeyCreated(ApiKeyOut):
    """The create response, and the only time the secret is ever returned.

    It is stored as a SHA-256 hash, so this value cannot be recovered later
    by us or by anyone who reaches the database.
    """
    key: str
