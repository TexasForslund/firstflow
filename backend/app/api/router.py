from fastapi import APIRouter

from app.api.routes import auth, classes, forms, health, reports, schools, students, superadmin

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(superadmin.router)
api_router.include_router(schools.router)
api_router.include_router(classes.router)
api_router.include_router(students.router)
api_router.include_router(forms.router)
api_router.include_router(reports.router)
api_router.include_router(reports.class_router)
