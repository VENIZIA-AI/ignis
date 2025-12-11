# Security Policy

## Supported Versions

The following versions of Ignis are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, send an email to: [**contact@venizia.ai**, **developer@venizia.ai**]

Include the following information in your report:

- **Description** of the vulnerability
- **Steps to reproduce** the issue
- **Potential impact** of the vulnerability
- **Suggested fix** (if you have one)
- **Your contact information** for follow-up questions

We will:

1. Acknowledge receipt of your report
2. Assign a team member to investigate
3. Keep you informed of our progress
4. Credit you in the security advisory (unless you prefer to remain anonymous)

### Disclosure Policy

- We follow responsible disclosure practices
- Please allow us reasonable time to address the issue before public disclosure
- We will coordinate with you on the disclosure timeline

## Security Best Practices

When using Ignis in your applications, follow these recommendations:

### Environment Variables

- Never commit `.env` files to version control
- Use environment-specific configurations
- Rotate secrets regularly

### Authentication & Authorization

- Use the built-in JWT components with strong secrets
- Implement proper access control using Casbin integration
- Validate all user inputs

### Dependencies

- Keep dependencies up to date
- Regularly audit packages with `bun audit` or `npm audit`
- Review security advisories for dependencies

### Production Deployment

- Enable HTTPS in production
- Set appropriate CORS policies
- Use rate limiting for public APIs
- Enable security headers

## Security Features in Ignis

Ignis provides built-in security features:

- **JWT Authentication** - Secure token-based auth via `jose`
- **Input Validation** - Zod schema validation for all inputs
- **RBAC/ABAC** - Role-based access control via Casbin integration
- **Secure Defaults** - Sensible security defaults out of the box

---

Thank you for helping keep Ignis and its users safe.
