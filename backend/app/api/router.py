from fastapi import APIRouter

from app.api.routes import (
    attendance,
    auth,
    classes,
    forms,
    health,
    invitations,
    me,
    overview,
    placements,
    reports,
    schools,
    students,
    superadmin,
    templates,
)

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(superadmin.router)
api_router.include_router(schools.router)
api_router.include_router(classes.router)
api_router.include_router(students.router)
api_router.include_router(me.router)
api_router.include_router(forms.router)
api_router.include_router(templates.router)
api_router.include_router(templates.class_router)
api_router.include_router(reports.router)
api_router.include_router(reports.class_router)
api_router.include_router(placements.workplace_router)
api_router.include_router(placements.router)
api_router.include_router(placements.class_router)
api_router.include_router(placements.me_router)
api_router.include_router(placements.supervisor_router)
api_router.include_router(attendance.router)
api_router.include_router(attendance.me_router)
api_router.include_router(attendance.class_router)
api_router.include_router(attendance.supervisor_router)
api_router.include_router(invitations.router)
api_router.include_router(invitations.public_router)
api_router.include_router(invitations.supervisor_router)
api_router.include_router(invitations.notification_router)
api_router.include_router(attendance.student_router)
api_router.include_router(reports.student_router)
api_router.include_router(overview.router)
api_router.include_router(overview.student_router)
