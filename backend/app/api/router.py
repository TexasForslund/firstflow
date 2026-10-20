from fastapi import APIRouter

from app.api.routes import auth, health, schools, superadmin

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(superadmin.router)
api_router.include_router(schools.router)
