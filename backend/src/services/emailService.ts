import { logger } from '../utils/logger';

export interface InvitationEmailData {
  to: string;
  organizationName: string;
  inviterName: string;
  role: string;
  token: string;
  message?: string;
}

export class EmailService {
  private baseUrl: string;
  private fromEmail: string;

  constructor() {
    this.baseUrl = process.env.FRONTEND_URL || 'https://app.stellar-privacy.com';
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@stellar-privacy.com';
  }

  async sendInvitationEmail(data: InvitationEmailData): Promise<void> {
    try {
      const invitationUrl = `${this.baseUrl}/invite/${data.token}`;
      
      // In a real implementation, you would use a service like SendGrid, AWS SES, or Nodemailer
      // For now, we'll log the email content and simulate sending
      
      const emailContent = this.generateInvitationEmailContent(data, invitationUrl);
      
      logger.info('Invitation email sent', {
        to: data.to,
        organizationName: data.organizationName,
        role: data.role,
        invitationUrl
      });

      // Simulate email sending - in production, replace with actual email service
      await this.simulateEmailSend(data.to, emailContent);
      
    } catch (error) {
      logger.error('Failed to send invitation email', { error, data });
      throw error;
    }
  }

  private generateInvitationEmailContent(data: InvitationEmailData, invitationUrl: string): {
    subject: string;
    htmlBody: string;
    textBody: string;
  } {
    const subject = `You're invited to join ${data.organizationName} on Stellar Privacy`;
    
    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitation to join ${data.organizationName}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4a5568; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f7fafc; }
          .button { display: inline-block; background: #3182ce; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .message { background: white; padding: 15px; border-left: 4px solid #3182ce; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Stellar Privacy</h1>
            <p>Enterprise Analytics Platform</p>
          </div>
          <div class="content">
            <h2>You're Invited!</h2>
            <p>${data.inviterName} has invited you to join <strong>${data.organizationName}</strong> on Stellar Privacy with the role of <strong>${data.role}</strong>.</p>
            
            ${data.message ? `
            <div class="message">
              <p><strong>Personal message:</strong></p>
              <p>"${data.message}"</p>
            </div>
            ` : ''}
            
            <p>Stellar Privacy provides enterprise-grade privacy analytics for Stellar ecosystem transactions. Join to collaborate with your team on secure financial analytics.</p>
            
            <p><strong>To accept this invitation:</strong></p>
            <ol>
              <li>Click the button below</li>
              <li>Verify your Stellar public key</li>
              <li>Start collaborating with your team</li>
            </ol>
            
            <div style="text-align: center;">
              <a href="${invitationUrl}" class="button">Accept Invitation</a>
            </div>
            
            <p><small>This invitation will expire in 7 days. If you need a new invitation, please contact ${data.inviterName}.</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Stellar Privacy. All rights reserved.</p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
      You're invited to join ${data.organizationName} on Stellar Privacy!
      
      ${data.inviterName} has invited you to join with the role of ${data.role}.
      
      ${data.message ? `\nPersonal message: "${data.message}"\n` : ''}
      
      Stellar Privacy provides enterprise-grade privacy analytics for Stellar ecosystem transactions.
      
      To accept this invitation, visit: ${invitationUrl}
      
      You'll need to verify your Stellar public key to complete the registration.
      
      This invitation will expire in 7 days.
      
      If you didn't expect this invitation, you can safely ignore this email.
      
      © 2024 Stellar Privacy. All rights reserved.
    `;

    return { subject, htmlBody, textBody };
  }

  private async simulateEmailSend(to: string, content: { subject: string; htmlBody: string; textBody: string }): Promise<void> {
    // Simulate email sending delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In production, replace this with actual email service integration:
    // - SendGrid: await sgMail.send({ to, from: this.fromEmail, subject: content.subject, html: content.htmlBody })
    // - AWS SES: await ses.sendEmail({ Source: this.fromEmail, Destination: { ToAddresses: [to] }, Message: { Subject: { Data: content.subject }, Body: { Html: { Data: content.htmlBody }, Text: { Data: content.textBody } } } })
    // - Nodemailer: await transporter.sendMail({ to, from: this.fromEmail, subject: content.subject, html: content.htmlBody, text: content.textBody })
    
    logger.debug('Email content prepared', {
      to,
      subject: content.subject,
      htmlBodyLength: content.htmlBody.length,
      textBodyLength: content.textBody.length
    });
  }
}

export const emailService = new EmailService();
