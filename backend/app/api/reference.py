"""Read-only reference data: the server-owned catalog and the basic wardrobe preset."""

from fastapi import APIRouter

from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe

router = APIRouter(prefix="/api")


@router.get("/catalog")
def get_catalog() -> dict:
    return {"success": True, "data": load_catalog()}


@router.get("/designs/default")
def get_default_design() -> dict:
    return {"success": True, "data": {"design": basic_wardrobe(), "revision": 1}}
