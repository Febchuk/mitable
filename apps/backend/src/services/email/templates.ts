/**
 * Email Templates — Branded HTML for transactional emails
 *
 * All templates share a consistent dark-themed design matching the Mitable app.
 * Inline styles only (email client compatibility).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared wrapper for all email templates */
function wrapInLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mitable</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#171717;border:1px solid #262626;border-radius:12px;overflow:hidden;">
          <!-- Logo -->
          <tr>
            <td style="padding:32px 32px 0 32px;">
              <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDY4IiBoZWlnaHQ9IjEwMiIgdmlld0JveD0iMCAwIDQ2OCAxMDIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxnIGNsaXAtcGF0aD0idXJsKCNjbGlwMF8yMDI2XzQ1KSI+CjxwYXRoIGQ9Ik0yIDIwSDEzLjVDMjAuNjc5NyAyMCAyNi41IDI1LjgyMDMgMjYuNSAzM1Y3MUMyNi41IDc4LjE3OTcgMjAuNjc5NyA4NCAxMy41IDg0QzYuMzIwMyA4NCAwLjUgNzguMTc5NyAwLjUgNzFWMjEuNUMwLjUgMjAuNjcxNiAxLjE3MTU3IDIwIDIgMjBaIiBmaWxsPSJ3aGl0ZSIgc3Ryb2tlPSJ3aGl0ZSIvPgo8cmVjdCB4PSIzMy41IiB5PSIyLjUiIHdpZHRoPSIyNSIgaGVpZ2h0PSI5OSIgcng9IjEyLjUiIGZpbGw9IndoaXRlIiBzdHJva2U9IndoaXRlIi8+CjxyZWN0IHg9IjY1LjUiIHk9IjIwIiB3aWR0aD0iMjYiIGhlaWdodD0iNjQiIHJ4PSIxMyIgZmlsbD0id2hpdGUiIHN0cm9rZT0id2hpdGUiLz4KPHBhdGggZD0iTTQ0My43OTQgODMuNkM0MzYuMzk0IDgzLjYgNDMwLjUyOCA4MS40NjY2IDQyNi4xOTQgNzcuMkM0MjEuODYxIDcyLjkzMzMgNDE5LjUyOCA2Ni44NjY2IDQxOS4xOTQgNTlDNDE5LjEyOCA1OC4zMzMzIDQxOS4wOTQgNTcuNSA0MTkuMDk0IDU2LjVDNDE5LjA5NCA1NS40MzMzIDQxOS4xMjggNTQuNiA0MTkuMTk0IDU0QzQxOS40NjEgNDkgNDIwLjU5NCA0NC42NjY2IDQyMi41OTQgNDFDNDI0LjY2MSAzNy4zMzMzIDQyNy40OTQgMzQuNTMzMyA0MzEuMDk0IDMyLjZDNDM0LjY5NCAzMC42IDQzOC45MjggMjkuNiA0NDMuNzk0IDI5LjZDNDQ5LjE5NCAyOS42IDQ1My43MjggMzAuNzMzMyA0NTcuMzk1IDMzQzQ2MS4wNjEgMzUuMiA0NjMuODI4IDM4LjMgNDY1LjY5NCA0Mi4zQzQ2Ny41NjEgNDYuMjMzMyA0NjguNDk1IDUwLjggNDY4LjQ5NSA1NlY1OC4xQzQ2OC40OTUgNTguNzY2NiA0NjguMjYxIDU5LjMzMzMgNDY3Ljc5NCA1OS44QzQ2Ny4zMjggNjAuMjY2NiA0NjYuNzI4IDYwLjUgNDY1Ljk5NSA2MC41SDQzMi43OTRDNDM2Ljc5NCA2MC41IDQzMi43OTQgNjAuNiA0MzIuNzk0IDYwLjhDNDMyLjc5NCA2MSA0MzIuNzk0IDYxLjE2NjYgNDMyLjc5NCA2MS4zQzQzMi44NjEgNjMuNjMzMyA0MzMuMjk0IDY1LjggNDM0LjA5NCA2Ny44QzQzNC45NjEgNjkuNzMzMyA0MzYuMTk0IDcxLjMgNDM3Ljc5NCA3Mi41QzQzOS40NjEgNzMuNyA0NDEuNDI4IDc0LjMgNDQzLjY5NCA3NC4zQzQ0NS41NjEgNzQuMyA0NDcuMTI4IDc0LjAzMzMgNDQ4LjM5NSA3My41QzQ0OS42NjEgNzIuOSA0NTAuNjk1IDcyLjIzMzMgNDUxLjQ5NSA3MS41QzQ1Mi4yOTUgNzAuNzY2NiA0NTIuODYxIDcwLjE2NjYgNDUzLjE5NCA2OS43QzQ1My43OTQgNjguOSA0NTQuMjYxIDY4LjQzMzMgNDU0LjU5NSA2OC4zQzQ1NC45OTUgNjguMSA0NTUuNTYxIDY4IDQ1Ni4yOTQgNjhINDY0Ljg5NUM0NjUuNTYxIDY4IDQ2Ni4wOTUgNjguMiA0NjYuNDk1IDY4LjZDNDY2Ljk2MSA2OSA0NjcuMTYxIDY5LjUgNDY3LjA5NCA3MC4xQzQ2Ny4wMjggNzEuMTY2NiA0NjYuNDYxIDcyLjQ2NjYgNDY1LjM5NSA3NEM0NjQuMzk0IDc1LjUzMzMgNDYyLjkyOCA3Ny4wMzMzIDQ2MC45OTUgNzguNUM0NTkuMDYxIDc5Ljk2NjYgNDU2LjYyOCA4MS4yIDQ1My42OTQgODIuMkM0NTAuODI4IDgzLjEzMzMgNDQ3LjUyOCA4My42IDQ0My43OTQgODMuNlpNNDMyLjc5NCA1Mi4xSDQ1NC44OTVWNTEuOEM0NTQuODk1IDQ5LjIgNDU0LjQ2MSA0Ni45MzMzIDQ1My41OTQgNDVDNDUyLjcyOCA0My4wNjY2IDQ1MS40NjEgNDEuNTMzMyA0NDkuNzk0IDQwLjRDNDQ4LjEyOCAzOS4yNjY2IDQ0Ni4xMjggMzguNyA0NDMuNzk0IDM4LjdDNDQxLjQ2MSAzOC43IDQzOS40NjEgMzkuMjY2NiA0MzcuNzk0IDQwLjRDNDM2LjEyOCA0MS41MzMzIDQzNC44NjEgNDMuMDY2NiA0MzMuOTk1IDQ1QzQzMy4xOTUgNDYuOTMzMyA0MzIuNzk0IDQ5LjIgNDMyLjc5NCA1MS44VjUyLjFaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMzk3LjQzIDgyLjZDMzk2Ljc2MyA4Mi42IDM5Ni4xOTYgODIuMzY2NiAzOTUuNzMgODEuOUMzOTUuMjYzIDgxLjQzMzMgMzk1LjAzIDgwLjg2NjYgMzk1LjAzIDgwLjJWMTRDMzk1LjAzIDEzLjMzMzMgMzk1LjI2MyAxMi43NjY2IDM5NS43MyAxMi4zQzM5Ni4xOTYgMTEuODMzMyAzOTYuNzYzIDExLjYgMzk3LjQzIDExLjZINDA1LjczQzQwNi4zOTYgMTEuNiA0MDYuOTYzIDExLjgzMzMgNDA3LjQzIDEyLjNDNDA3Ljg5NiAxMi43NjY2IDQwOC4xMyAxMy4zMzMzIDQwOC4xMyAxNFY4MC4yQzQwOC4xMyA4MC44NjY2IDQwNy44OTYgODEuNDMzMyA0MDcuNDMgODEuOUM0MDYuOTYzIDgyLjM2NjYgNDA2LjM5NiA4Mi42IDQwNS43MyA4Mi42SDM5Ny40M1oiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0zNjIuNDAyIDgzLjZDMzU4LjUzNSA4My42IDM1NS4zMDIgODIuOTMzMyAzNTIuNzAyIDgxLjZDMzUwLjE2OCA4MC4yNjY2IDM0OC4wNjggNzguNTY2NyAzNDYuNDAyIDc2LjVWODAuMkMzNDYuNDAyIDgwLjg2NjYgMzQ2LjE2OCA4MS40MzMzIDM0NS43MDIgODEuOUMzNDUuMzAyIDgyLjM2NjYgMzQ0LjczNSA4Mi42IDM0NC4wMDIgODIuNkgzMzYuMTAyQzMzNS40MzUgODIuNiAzMzQuODY4IDgyLjM2NjYgMzM0LjQwMiA4MS45QzMzMy45MzUgODEuNDMzMyAzMzMuNzAyIDgwLjg2NjYgMzMzLjcwMiA4MC4yVjE0QzMzMy43MDIgMTMuMzMzMyAzMzMuOTM1IDEyLjc2NjYgMzM0LjQwMiAxMi4zQzMzNC44NjggMTEuODMzMyAzMzUuNDM1IDExLjYgMzM2LjEwMiAxMS42SDM0NC42MDJDMzQ1LjMzNSAxMS42IDM0NS45MDIgMTEuODMzMyAzNDYuMzAyIDEyLjNDMzQ2Ljc2OCAxMi43NjY2IDM0Ny4wMDIgMTMuMzMzMyAzNDcuMDAyIDE0VjM2LjJDMzQ4LjY2OCAzNC4yNjY2IDM1MC43MzUgMzIuNyAzNTMuMjAyIDMxLjVDMzU1LjczNSAzMC4yMzMzIDM1OC44MDIgMjkuNiAzNjIuNDAyIDI5LjZDMzY1LjkzNSAyOS42IDM2OS4wMDIgMzAuMiAzNzEuNjAyIDMxLjRDMzc0LjIwMiAzMi42IDM3Ni4zNjggMzQuMyAzNzguMTAyIDM2LjVDMzc5LjkwMiAzOC42MzMzIDM4MS4yNjggNDEuMTMzMyAzODIuMjAyIDQ0QzM4My4xMzUgNDYuODY2NiAzODMuNjM1IDQ5Ljk2NjYgMzgzLjcwMiA1My4zQzM4My43NjggNTQuNSAzODMuODAyIDU1LjYgMzgzLjgwMiA1Ni42QzM4My44MDIgNTcuNTMzMyAzODMuNzY4IDU4LjYgMzgzLjcwMiA1OS44QzM4My41NjggNjMuMjY2NiAzODMuMDM1IDY2LjQ2NjYgMzgyLjEwMiA2OS40QzM4MS4xNjggNzIuMjY2NiAzNzkuODM1IDc0Ljc2NjYgMzc4LjEwMiA3Ni45QzM3Ni4zNjggNzkuMDMzMyAzNzQuMjAyIDgwLjcgMzcxLjYwMiA4MS45QzM2OS4wMDIgODMuMDMzMyAzNjUuOTM1IDgzLjYgMzYyLjQwMiA4My42Wk0zNTguNzAyIDcyLjlDMzYxLjU2OCA3Mi45IDM2My44MDIgNzIuMyAzNjUuNDAyIDcxLjFDMzY3LjAwMiA2OS44MzMzIDM2OC4xMzUgNjguMiAzNjguODAyIDY2LjJDMzY5LjUzNSA2NC4yIDM2OS45NjggNjIgMzcwLjEwMiA1OS42QzM3MC4yMzUgNTcuNiAzNzAuMjM1IDU1LjYgMzcwLjEwMiA1My42QzM2OS45NjggNTEuMiAzNjkuNTM1IDQ5IDM2OC44MDIgNDdDMzY4LjEzNSA0NSAzNjcuMDAyIDQzLjQgMzY1LjQwMiA0Mi4yQzM2My44MDIgNDAuOTMzMyAzNjEuNTY4IDQwLjMgMzU4LjcwMiA0MC4zQzM1Ni4wMzUgNDAuMyAzNTMuODY4IDQwLjkgMzUyLjIwMiA0Mi4xQzM1MC41MzUgNDMuMyAzNDkuMjY4IDQ0LjgzMzMgMzQ4LjQwMiA0Ni43QzM0Ny41MzUgNDguNSAzNDcuMDY4IDUwLjQgMzQ3LjAwMiA1Mi40QzM0Ni45MzUgNTMuNiAzNDYuOTAyIDU0LjkgMzQ2LjkwMiA1Ni4zQzM0Ni45MDIgNTcuNjMzMyAzNDYuOTM1IDU4LjkgMzQ3LjAwMiA2MC4xQzM0Ny4xMzUgNjIuMTY2NiAzNDcuNTY4IDY0LjIgMzQ4LjMwMiA2Ni4yQzM0OS4xMDIgNjguMTMzMyAzNTAuMzM1IDY5LjczMzMgMzUyLjAwMiA3MUMzNTMuNzM1IDcyLjI2NjYgMzU1Ljk2OCA3Mi45IDM1OC43MDIgNzIuOVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yOTEuNTczIDgzLjZDMjg4LjEwNiA4My42IDI4NC45NzMgODIuOTMzMyAyODIuMTczIDgxLjZDMjc5LjM3MyA4MC4yIDI3Ny4xMzkgNzguMzY2NiAyNzUuNDczIDc2LjFDMjczLjg3MyA3My43NjY2IDI3My4wNzMgNzEuMTY2NiAyNzMuMDczIDY4LjNDMjczLjA3MyA2My42MzMzIDI3NC45MzkgNTkuOTMzMyAyNzguNjczIDU3LjJDMjgyLjQ3MyA1NC40IDI4Ny40NzMgNTIuNTMzMyAyOTMuNjczIDUxLjZMMzA3LjM3MyA0OS42VjQ3LjVDMzA3LjM3MyA0NC43IDMwNi42NzMgNDIuNTMzMyAzMDUuMjczIDQxQzMwMy44NzMgMzkuNDY2NiAzMDEuNDczIDM4LjcgMjk4LjA3MyAzOC43QzI5NS42NzMgMzguNyAyOTMuNzA2IDM5LjIgMjkyLjE3MyA0MC4yQzI5MC43MDYgNDEuMTMzMyAyODkuNjA2IDQyLjQgMjg4Ljg3MyA0NEMyODguMzM5IDQ0Ljg2NjYgMjg3LjU3MyA0NS4zIDI4Ni41NzMgNDUuM0gyNzguNjczQzI3Ny45MzkgNDUuMyAyNzcuMzczIDQ1LjEgMjc2Ljk3MyA0NC43QzI3Ni42MzkgNDQuMyAyNzYuNDczIDQzLjc2NjYgMjc2LjQ3MyA0My4xQzI3Ni41MzkgNDIuMDMzMyAyNzYuOTczIDQwLjczMzMgMjc3Ljc3MyAzOS4yQzI3OC41NzMgMzcuNjY2NiAyNzkuODM5IDM2LjIgMjgxLjU3MyAzNC44QzI4My4zMDYgMzMuMzMzMyAyODUuNTM5IDMyLjEgMjg4LjI3MyAzMS4xQzI5MS4wMDYgMzAuMSAyOTQuMzA2IDI5LjYgMjk4LjE3MyAyOS42QzMwMi4zNzMgMjkuNiAzMDUuOTA2IDMwLjEzMzMgMzA4Ljc3MyAzMS4yQzMxMS43MDYgMzIuMiAzMTQuMDM5IDMzLjU2NjYgMzE1Ljc3MyAzNS4zQzMxNy41MDYgMzcuMDMzMyAzMTguNzczIDM5LjA2NjYgMzE5LjU3MyA0MS40QzMyMC4zNzMgNDMuNzMzMyAzMjAuNzczIDQ2LjIgMzIwLjc3MyA0OC44VjgwLjJDMzIwLjc3MyA4MC44NjY2IDMyMC41MzkgODEuNDMzMyAzMjAuMDczIDgxLjlDMzE5LjYwNiA4Mi4zNjY2IDMxOS4wMzkgODIuNiAzMTguMzczIDgyLjZIMzEwLjI3M0MzMDkuNTM5IDgyLjYgMzA4LjkzOSA4Mi4zNjY2IDMwOC40NzMgODEuOUMzMDguMDczIDgxLjQzMzMgMzA3Ljg3MyA4MC44NjY2IDMwNy44NzMgODAuMlY3Ni4zQzMwNy4wMDYgNzcuNTY2NiAzMDUuODM5IDc4Ljc2NjYgMzA0LjM3MyA3OS45QzMwMi45MDYgODAuOTY2NiAzMDEuMTA2IDgxLjg2NjYgMjk4Ljk3MyA4Mi42QzI5Ni45MDYgODMuMjY2NiAyOTQuNDM5IDgzLjYgMjkxLjU3MyA4My42Wk0yOTQuOTczIDc0LjFDMjk3LjMwNiA3NC4xIDI5OS40MDYgNzMuNiAzMDEuMjczIDcyLjZDMzAzLjIwNiA3MS42IDMwNC43MDYgNzAuMDY2NiAzMDUuNzczIDY4QzMwNi45MDYgNjUuODY2NiAzMDcuNDczIDYzLjIgMzA3LjQ3MyA2MFY1Ny45TDI5Ny40NzMgNTkuNUMyOTMuNTM5IDYwLjEgMjkwLjYwNiA2MS4wNjY2IDI4OC42NzMgNjIuNEMyODYuNzM5IDYzLjczMzMgMjg1Ljc3MyA2NS4zNjY2IDI4NS43NzMgNjcuM0MyODUuNzczIDY4Ljc2NjYgMjg2LjIwNiA3MC4wMzMzIDI4Ny4wNzMgNzEuMUMyODguMDA2IDcyLjEgMjg5LjE3MyA3Mi44NjY2IDI5MC41NzMgNzMuNEMyOTEuOTczIDczLjg2NjYgMjkzLjQzOSA3NC4xIDI5NC45NzMgNzQuMVoiIGZpbGw9IndoaXRlIi8+CjxwYXRoIGQ9Ik0yNTcuMTAyIDgyLjZDMjUzLjEwMiA4Mi42IDI0OS43MzUgODEuOSAyNDcuMDAyIDgwLjVDMjQ0LjI2OCA3OS4xIDI0Mi4yMzUgNzcuMDMzMyAyNDAuOTAyIDc0LjNDMjM5LjU2OCA3MS41IDIzOC45MDIgNjguMDMzMyAyMzguOTAyIDYzLjlWNDEuMkgyMzEuMDAyQzIzMC4zMzUgNDEuMiAyMjkuNzY4IDQwLjk2NjYgMjI5LjMwMiA0MC41QzIyOC44MzUgNDAuMDMzMyAyMjguNjAyIDM5LjQ2NjYgMjI4LjYwMiAzOC44VjMzQzIyOC42MDIgMzIuMzMzMyAyMjguODM1IDMxLjc2NjYgMjI5LjMwMiAzMS4zQzIyOS43NjggMzAuODMzMyAyMzAuMzM1IDMwLjYgMjMxLjAwMiAzMC42SDIzOC45MDJWMTRDMjM4LjkwMiAxMy4zMzMzIDIzOS4xMDIgMTIuNzY2NiAyMzkuNTAyIDEyLjNDMjM5Ljk2OCAxMS44MzMzIDI0MC41NjggMTEuNiAyNDEuMzAyIDExLjZIMjQ5LjQwMkMyNTAuMDY4IDExLjYgMjUwLjYzNSAxMS44MzMzIDI1MS4xMDIgMTIuM0MyNTEuNTY4IDEyLjc2NjYgMjUxLjgwMiAxMy4zMzMzIDI1MS44MDIgMTRWMzAuNkgyNjQuMzAyQzI2NC45NjggMzAuNiAyNjUuNTM1IDMwLjgzMzMgMjY2LjAwMiAzMS4zQzI2Ni40NjggMzEuNzY2NiAyNjYuNzAyIDMyLjMzMzMgMjY2LjcwMiAzM1YzOC44QzI2Ni43MDIgMzkuNDY2NiAyNjYuNDY4IDQwLjAzMzMgMjY2LjAwMiA0MC41QzI2NS41MzUgNDAuOTY2NiAyNjQuOTY4IDQxLjIgMjY0LjMwMiA0MS4ySDI1MS44MDJWNjIuOUMyNTEuODAyIDY1LjYzMzMgMjUyLjI2OCA2Ny43NjY2IDI1My4yMDIgNjkuM0MyNTQuMjAyIDcwLjgzMzMgMjU1LjkwMiA3MS42IDI1OC4zMDIgNzEuNkgyNjUuMjAyQzI2NS44NjggNzEuNiAyNjYuNDM1IDcxLjgzMzMgMjY2LjkwMiA3Mi4zQzI2Ny4zNjggNzIuNzY2NiAyNjcuNjAyIDczLjMzMzMgMjY3LjYwMiA3NFY4MC4yQzI2Ny42MDIgODAuODY2NiAyNjcuMzY4IDgxLjQzMzMgMjY2LjkwMiA4MS45QzI2Ni40MzUgODIuMzY2NiAyNjUuODY4IDgyLjYgMjY1LjIwMiA4Mi42SDI1Ny4xMDJaIiBmaWxsPSJ3aGl0ZSIvPgo8cGF0aCBkPSJNMjA5LjYzNCA4Mi42QzIwOC45NjggODIuNiAyMDguNDAxIDgyLjM2NjcgMjA3LjkzNCA4MS45QzIwNy40NjggODEuNDMzMyAyMDcuMjM0IDgwLjg2NjcgMjA3LjIzNCA4MC4yVjMzQzIwNy4yMzQgMzIuMzMzMyAyMDcuNDY4IDMxLjc2NjcgMjA3LjkzNCAzMS4zQzIwOC40MDEgMzAuODMzMyAyMDguOTY4IDMwLjYgMjA5LjYzNCAzMC42SDIxNy45MzRDMjE4LjY2OCAzMC42IDIxOS4yMzQgMzAuODMzMyAyMTkuNjM0IDMxLjNDMjIwLjEwMSAzMS43NjY3IDIyMC4zMzQgMzIuMzMzMyAyMjAuMzM0IDMzVjgwLjJDMjIwLjMzNCA4MC44NjY3IDIyMC4xMDEgODEuNDMzMyAyMTkuNjM0IDgxLjlDMjE5LjIzNCA4Mi4zNjY3IDIxOC42NjggODIuNiAyMTcuOTM0IDgyLjZIMjA5LjYzNFpNMjA5LjIzNCAyMkMyMDguNTAxIDIyIDIwNy45MDEgMjEuOCAyMDcuNDM0IDIxLjRDMjA3LjAzNCAyMC45MzMzIDIwNi44MzQgMjAuMzMzMyAyMDYuODM0IDE5LjZWMTIuNEMyMDYuODM0IDExLjczMzMgMjA3LjAzNCAxMS4xNjY3IDIwNy40MzQgMTAuN0MyMDcuOTAxIDEwLjIzMzMgMjA4LjUwMSAxMCAyMDkuMjM0IDEwSDIxOC4zMzRDMjE5LjA2OCAxMCAyMTkuNjY4IDEwLjIzMzMgMjIwLjEzNCAxMC43QzIyMC42MDEgMTEuMTY2NyAyMjAuODM0IDExLjczMzMgMjIwLjgzNCAxMi40VjE5LjZDMjIwLjgzNCAyMC4zMzMzIDIyMC42MDEgMjAuOTMzMyAyMjAuMTM0IDIxLjRDMjE5LjY2OCAyMS44IDIxOS4wNjggMjIgMjE4LjMzNCAyMkgyMDkuMjM0WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTExOS40IDgyLjZDMTE4LjczMyA4Mi42IDExOC4xNjcgODIuMzY2NyAxMTcuNyA4MS45QzExNy4yMzMgODEuNDMzMyAxMTcgODAuODY2NyAxMTcgODAuMlYzM0MxMTcgMzIuMzMzMyAxMTcuMjMzIDMxLjc2NjcgMTE3LjcgMzEuM0MxMTguMTY3IDMwLjgzMzMgMTE4LjczMyAzMC42IDExOS40IDMwLjZIMTI3LjJDMTI3Ljg2NyAzMC42IDEyOC40MzMgMzAuODMzMyAxMjguOSAzMS4zQzEyOS4zNjcgMzEuNzY2NyAxMjkuNiAzMi4zMzMzIDEyOS42IDMzVjM2LjRDMTMxIDM0LjUzMzMgMTMyLjg2NyAzMi45NjY3IDEzNS4yIDMxLjdDMTM3LjYgMzAuMzY2NyAxNDAuNDMzIDI5LjY2NjcgMTQzLjcgMjkuNkMxNTEuMyAyOS40NjY3IDE1Ni42IDMyLjQzMzMgMTU5LjYgMzguNUMxNjEuMTMzIDM1LjgzMzMgMTYzLjMzMyAzMy43IDE2Ni4yIDMyLjFDMTY5LjEzMyAzMC40MzMzIDE3Mi4zNjcgMjkuNiAxNzUuOSAyOS42QzE3OS4zNjcgMjkuNiAxODIuNSAzMC40IDE4NS4zIDMyQzE4OC4xNjcgMzMuNiAxOTAuNCAzNi4wMzMzIDE5MiAzOS4zQzE5My42NjcgNDIuNSAxOTQuNSA0Ni41NjY3IDE5NC41IDUxLjVWODAuMkMxOTQuNSA4MC44NjY3IDE5NC4yNjcgODEuNDMzMyAxOTMuOCA4MS45QzE5My4zMzMgODIuMzY2NyAxOTIuNzY3IDgyLjYgMTkyLjEgODIuNkgxODMuOUMxODMuMjMzIDgyLjYgMTgyLjY2NyA4Mi4zNjY3IDE4Mi4yIDgxLjlDMTgxLjczMyA4MS40MzMzIDE4MS41IDgwLjg2NjcgMTgxLjUgODAuMlY1Mi4zQzE4MS41IDQ5LjMgMTgxLjA2NyA0Ni45MzMzIDE4MC4yIDQ1LjJDMTc5LjMzMyA0My40IDE3OC4xNjcgNDIuMTMzMyAxNzYuNyA0MS40QzE3NS4yMzMgNDAuNjY2NyAxNzMuNiA0MC4zIDE3MS44IDQwLjNDMTcwLjMzMyA0MC4zIDE2OC44NjcgNDAuNjY2NyAxNjcuNCA0MS40QzE2NS45MzMgNDIuMTMzMyAxNjQuNzMzIDQzLjQgMTYzLjggNDUuMkMxNjIuODY3IDQ2LjkzMzMgMTYyLjQgNDkuMyAxNjIuNCA1Mi4zVjgwLjJDMTYyLjQgODAuODY2NyAxNjIuMTY3IDgxLjQzMzMgMTYxLjcgODEuOUMxNjEuMjMzIDgyLjM2NjcgMTYwLjY2NyA4Mi42IDE2MCA4Mi42SDE1MS44QzE1MS4wNjcgODIuNiAxNTAuNDY3IDgyLjM2NjcgMTUwIDgxLjlDMTQ5LjYgODEuNDMzMyAxNDkuNCA4MC44NjY3IDE0OS40IDgwLjJWNTIuM0MxNDkuNCA0OS4zIDE0OC45MzMgNDYuOTMzMyAxNDggNDUuMkMxNDcuMDY3IDQzLjQgMTQ1Ljg2NyA0Mi4xMzMzIDE0NC40IDQxLjRDMTQyLjkzMyA0MC42NjY3IDE0MS4zNjcgNDAuMyAxMzkuNyA0MC4zQzEzOC4xNjcgNDAuMyAxMzYuNjY3IDQwLjcgMTM1LjIgNDEuNUMxMzMuNzMzIDQyLjIzMzMgMTMyLjUzMyA0My40NjY3IDEzMS42IDQ1LjJDMTMwLjY2NyA0Ni45MzMzIDEzMC4yIDQ5LjMgMTMwLjIgNTIuM1Y4MC4yQzEzMC4yIDgwLjg2NjcgMTI5Ljk2NyA4MS40MzMzIDEyOS41IDgxLjlDMTI5LjAzMyA4Mi4zNjY3IDEyOC40NjcgODIuNiAxMjcuOCA4Mi42SDExOS40WiIgZmlsbD0id2hpdGUiLz4KPC9nPgo8ZGVmcz4KPGNsaXBQYXRoIGlkPSJjbGlwMF8yMDI2XzQ1Ij4KPHJlY3Qgd2lkdGg9IjQ2OCIgaGVpZ2h0PSIxMDIiIGZpbGw9IndoaXRlIi8+CjwvY2xpcFBhdGg+CjwvZGVmcz4KPC9zdmc+Cg==" alt="Mitable" style="height:32px;width:auto;display:block;" />
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:24px 32px 32px 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #262626;">
              <p style="margin:0;font-size:12px;color:#737373;line-height:1.5;">
                This is an automated message from Mitable. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Primary CTA button */
function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background:#6366f1;border-radius:8px;padding:12px 28px;">
      <a href="${escapeHtml(url)}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`;
}

// ─── Template Builders ───────────────────────────────────────────────────────

export function buildWelcomeAdminEmail(params: {
  firstName: string;
  organizationName: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Welcome to Mitable</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, your organization <strong style="color:#e5e5e5;">${escapeHtml(params.organizationName)}</strong> is all set up and ready to go.
    </p>
    <p style="margin:0 0 12px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      As the admin, you can:
    </p>
    <ul style="margin:0 0 20px 0;padding-left:20px;font-size:14px;color:#a3a3a3;line-height:1.8;">
      <li>Add team members from the People tab</li>
      <li>Configure integrations (Slack, Linear, Notion)</li>
      <li>Review session recaps and generated docs</li>
    </ul>
    <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Open the Mitable desktop app to start your first session. If you haven't installed it yet, download it from your dashboard.
    </p>
  `);
}

export function buildWelcomeEmployeeEmail(params: {
  email: string;
  firstName: string;
  organizationName: string;
  temporaryPassword: string;
  loginUrl: string;
}): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">You're in!</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, you've been added to <strong style="color:#e5e5e5;">${escapeHtml(params.organizationName)}</strong> on Mitable.
    </p>
    <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#d4d4d4;text-transform:uppercase;letter-spacing:0.5px;">Your login credentials</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#0a0a0a;border:1px solid #333333;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:16px;">
          <p style="margin:0 0 8px 0;font-size:13px;color:#737373;">Email</p>
          <p style="margin:0 0 16px 0;font-size:14px;color:#ffffff;font-family:monospace;">${escapeHtml(params.email)}</p>
          <p style="margin:0 0 8px 0;font-size:13px;color:#737373;">Temporary Password</p>
          <p style="margin:0;font-size:14px;color:#ffffff;font-family:monospace;background:#1a1a2e;padding:8px 12px;border-radius:6px;border:1px solid #333333;">${escapeHtml(params.temporaryPassword)}</p>
        </td>
      </tr>
    </table>
    ${ctaButton("Sign In to Mitable", params.loginUrl)}
    <p style="margin:0;font-size:13px;color:#737373;line-height:1.5;">
      We recommend changing your password after your first login. Go to <strong style="color:#a3a3a3;">Settings → Security</strong> to update it.
    </p>
  `);
}

export function buildPasswordResetEmail(params: { firstName: string; resetUrl: string }): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Reset your password</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, we received a request to reset your Mitable password. Click the button below to set a new one.
    </p>
    ${ctaButton("Reset Password", params.resetUrl)}
    <p style="margin:0 0 8px 0;font-size:13px;color:#737373;line-height:1.5;">
      This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.
    </p>
    <p style="margin:0;font-size:13px;color:#737373;line-height:1.5;">
      If the button doesn't work, copy and paste this link into your browser:
    </p>
    <p style="margin:8px 0 0 0;font-size:12px;color:#6366f1;word-break:break-all;">
      <a href="${escapeHtml(params.resetUrl)}" style="color:#6366f1;text-decoration:underline;">${escapeHtml(params.resetUrl)}</a>
    </p>
  `);
}

export function buildPasswordChangedEmail(params: { firstName: string }): string {
  return wrapInLayout(`
    <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:600;color:#ffffff;">Password changed</h1>
    <p style="margin:0 0 20px 0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      Hi ${escapeHtml(params.firstName)}, your Mitable password was successfully updated.
    </p>
    <p style="margin:0;font-size:14px;color:#a3a3a3;line-height:1.6;">
      If you didn't make this change, please reset your password immediately or contact your organization admin.
    </p>
  `);
}
