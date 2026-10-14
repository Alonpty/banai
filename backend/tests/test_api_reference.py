from fastapi.testclient import TestClient

from app.domain.catalog import load_catalog
from app.domain.defaults import basic_wardrobe
from app.main import app

client = TestClient(app)


def test_catalog_endpoint_returns_server_owned_catalog():
    response = client.get("/api/catalog")
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": load_catalog()}


def test_default_design_endpoint_returns_basic_wardrobe():
    response = client.get("/api/designs/default")
    assert response.status_code == 200
    assert response.json() == {"success": True, "data": {"design": basic_wardrobe(), "revision": 1}}


def test_reference_endpoints_are_cacheable_but_not_writable():
    assert client.post("/api/catalog").status_code == 405
