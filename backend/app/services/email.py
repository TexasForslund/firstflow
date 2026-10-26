"""Skickar e-post.

SMTP är inte uppsatt än (D4 i att-gora/drift.md). Utan `SMTP_HOST` skrivs mejlet till loggen,
så att inbjudningar går att testa lokalt. I produktion skrivs aldrig länkar till loggen: där
krävs SMTP.
"""

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger("firstflow.email")


class EmailNotConfigured(RuntimeError):
    pass


def send_email(to: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        if settings.environment == "production":
            raise EmailNotConfigured("SMTP är inte inställt")
        logger.warning(
            "E-post (skickas inte, SMTP saknas)\nTill: %s\nÄmne: %s\n\n%s", to, subject, body
        )
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
