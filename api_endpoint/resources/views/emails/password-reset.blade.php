<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Reset your Cloud OS password</title>
</head>
<body style="margin:0;padding:0;background:#f4f8fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:620px;margin:0 auto;padding:32px 20px;">
        <div style="background:#ffffff;border-radius:16px;padding:28px;border:1px solid #dbe7f3;">
            <h1 style="margin:0 0 12px;font-size:24px;color:#020713;">Reset your Cloud OS password</h1>
            <p style="font-size:15px;line-height:1.6;color:#334155;">Hello {{ $name }},</p>
            <p style="font-size:15px;line-height:1.6;color:#334155;">
                We received a request to reset the password for your Cloud OS account. Use the secure link below to choose a new password.
            </p>
            <p style="margin:28px 0;">
                <a href="{{ $resetUrl }}" style="display:inline-block;background:#0ea5e9;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px;">Reset password</a>
            </p>
            <p style="font-size:13px;line-height:1.6;color:#64748b;">
                This link expires after 60 minutes. If you did not request a password reset, you can safely ignore this email.
            </p>
            <p style="font-size:13px;line-height:1.6;color:#64748b;word-break:break-all;">
                {{ $resetUrl }}
            </p>
        </div>
    </div>
</body>
</html>
