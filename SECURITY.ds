# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in AgentForge, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, send me a message on LinkedIn

Or use GitHub's private vulnerability reporting:
1. Go to the Security tab
2. Click "Report a vulnerability"
3. Provide details

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **24 hours**: Acknowledgment of report
- **72 hours**: Initial assessment
- **7 days**: Plan for fix or mitigation
- **30 days**: Public disclosure (coordinated)

## Security Best Practices

When using AgentForge in production:

### API Keys
- Never commit API keys to source control
- Use environment variables or secret managers
- Rotate keys regularly

### Tool Execution
- Validate all tool inputs with Zod schemas
- Sanitize outputs before displaying to users
- Implement rate limiting on tool calls

### Network Security
- Use HTTPS for all API calls
- Be cautious with tools that fetch external URLs (SSRF risk)
- Implement allowlists for external domains if tools access URLs

### Data Handling
- Redact sensitive data from logs (use `LoggingMiddleware` with `redactKeys`)
- Don't persist conversation history containing PII without encryption
- Implement data retention policies
