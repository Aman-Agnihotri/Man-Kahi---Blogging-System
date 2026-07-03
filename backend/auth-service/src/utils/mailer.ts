import logger from '@shared/utils/logger'

// No email transport (SES/SendGrid/SMTP/etc.) is wired up anywhere in this
// codebase yet - see the Phase 4 notes in docs/ACTION_PLAN.md. This stands
// in for a real provider so the password-reset flow itself is otherwise
// complete: swapping in real delivery later only means changing this one
// function, not any of its callers. In development this logs the link so
// the flow is actually testable end-to-end without a mail server.
export async function sendPasswordResetEmail(email: string, resetLink: string): Promise<void> {
  logger.warn(`[dev-only email stub] Password reset requested for ${email}: ${resetLink}`)
}
