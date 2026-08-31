# Montessori external API reference

The Montessori app exposes a school-scoped, server-to-server API at
`https://www.mitable.ng/api/public/v1` in production. For local development,
use `http://localhost:3100/api/public/v1`. Always use the `www` production
host: `https://mitable.ng` redirects to it and may return HTML rather than the
API response in clients that do not follow redirects. It is designed for
trusted workflow integrations such as Lorikeet. Every key is limited to the
school where it was created.

This API intentionally uses a **school-wide integration key**, not a separate
key for each admin, teacher, or guardian. A workflow should first resolve the
requester's email with the Directory endpoint, apply the school's role rules,
and only then call a write endpoint. The API itself always enforces school
boundaries, even when the workflow makes the role decision.

## Key setup and authentication

The in-app key-management page is behind the deployment feature flag:

```env
NEXT_PUBLIC_ADMIN_EXTERNAL_API=true
```

Restart the Next.js server after changing this value. An authenticated school
administrator can then use **Admin → API Keys** to create/revoke keys, or use:

| Method | Path                      | In-app meaning                                                |
| ------ | ------------------------- | ------------------------------------------------------------- |
| GET    | `/api/admin/api-keys`     | Lists the school's integration keys; never includes a secret. |
| POST   | `/api/admin/api-keys`     | Creates a read and/or write key. The secret is returned once. |
| DELETE | `/api/admin/api-keys/:id` | Immediately revokes a key.                                    |

Send the returned secret with every external request:

```bash
curl https://www.mitable.ng/api/public/v1/classrooms \
  -H "Authorization: Bearer mitable_KEY_ID.SECRET"
```

`X-API-Key: mitable_KEY_ID.SECRET` is also accepted. Read keys can call only
GET endpoints; write keys can call GET plus POST, PATCH, and DELETE endpoints.
Revoked/expired keys return `401`; records from a different school return `404`.

This is an application API, not direct Supabase table access. A valid key
returns JSON only from the endpoints documented below, using each endpoint's
intentional response shape. It does not expose arbitrary database tables or
every column in a table.

## Identity and people

| Method | Path                      | What it does in Mitable                                                                                                                                                       |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/directory?email=EMAIL`  | Exact email lookup for the workflow's first-step identity check. Returns matching active staff (with `role`) and guardian records, including each guardian's linked children. |
| GET    | `/teachers`               | Lists active teacher profiles and their current classroom assignments.                                                                                                        |
| GET    | `/guardians?email=EMAIL`  | Lists guardian contact records; optional exact email filter. Includes whether the guardian has activated the parent account.                                                  |
| POST   | `/guardians`              | Creates a guardian contact record. It does not send an invitation or create a sign-in account.                                                                                |
| GET    | `/guardians/:id`          | Reads one guardian contact record and parent-account status.                                                                                                                  |
| PATCH  | `/guardians/:id`          | Updates guardian name, phone, or contact preference. Email is deliberately not changed through the external API.                                                              |
| GET    | `/guardians/:id/students` | Lists active children linked to the guardian, including relationship and report-delivery settings.                                                                            |

## Classrooms and teacher assignments

| Method | Path                       | What it does in Mitable                                                                                                                                                          |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/classrooms`              | Lists active classrooms in the school.                                                                                                                                           |
| POST   | `/classrooms`              | Creates an active classroom. Accepts `name`, optional `code`, optional `curriculumId`, and optional `programTypes`.                                                              |
| GET    | `/classrooms/:id`          | Reads one active classroom.                                                                                                                                                      |
| PATCH  | `/classrooms/:id`          | Changes a classroom's name, code, curriculum, or enabled programs.                                                                                                               |
| GET    | `/classrooms/:id/teachers` | Lists current teacher assignments in the classroom.                                                                                                                              |
| POST   | `/classrooms/:id/teachers` | Assigns an existing teacher. Body: `teacherId`, optional `role` (`lead`, `support`, `assistant`), optional `startDate`. Assigning a lead makes the prior lead a support teacher. |
| DELETE | `/classrooms/:id/teachers` | Ends a current teacher assignment. Body: `assignmentId`, `endDate`.                                                                                                              |

## Students, enrollment, and families

| Method | Path                                    | What it does in Mitable                                                                                                                               |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/students?classroomId=ID`              | Lists active students; optional classroom filter. Includes enrollment history.                                                                        |
| POST   | `/students`                             | Creates a child profile. Optional `classroomId` creates the initial primary enrollment.                                                               |
| GET    | `/students/:id`                         | Reads a child profile and enrollment history.                                                                                                         |
| PATCH  | `/students/:id`                         | Corrects profile fields such as name, birth date, nickname, or notes.                                                                                 |
| DELETE | `/students/:id`                         | Archives a child; this is reversible in the app, not a hard delete.                                                                                   |
| POST   | `/students/:id/transfer`                | Moves an existing child to another classroom while preserving enrollment history. Body: `classroomId`, `startDate`. This is one database transaction. |
| GET    | `/students/:id/guardians`               | Lists guardian relationships for a child.                                                                                                             |
| POST   | `/students/:id/guardians`               | Links an existing guardian to a child. Body: `guardianId`, optional `relationship`, `isPrimaryContact`, `receivesReports`.                            |
| PATCH  | `/students/:id/guardians`               | Updates an existing guardian relationship and its contact/report flags. Same body as POST.                                                            |
| DELETE | `/students/:id/guardians?guardianId=ID` | Removes a guardian–child link only; neither person record is deleted.                                                                                 |

## Teacher day-to-day records

| Method | Path                                         | What it does in Mitable                                                                                                                                                                                    |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/attendance?date=YYYY-MM-DD&classroomId=ID` | Reads attendance across the school; both filters are optional.                                                                                                                                             |
| POST   | `/attendance`                                | Creates or corrects a child's attendance for a date. Repeating the same child/date updates the existing mark. Body: `studentId`, `classroomId`, `date`, `status` (`present`/`absent`), optional `comment`. |
| GET    | `/reports?studentId=ID`                      | Lists report records; optional student filter.                                                                                                                                                             |
| POST   | `/reports`                                   | Creates a **draft** daily or major report. Draft-only prevents an integration from bypassing the app's review/sending process.                                                                             |
| GET    | `/reports/:id`                               | Reads one report, including its body.                                                                                                                                                                      |
| PATCH  | `/reports/:id`                               | Edits a draft report's title, body, or dates.                                                                                                                                                              |
| DELETE | `/reports/:id`                               | Deletes a draft report. Sent reports cannot be changed or deleted through this API.                                                                                                                        |

## Workflow policy to enforce before writes

The shared key is intentionally powerful. Lorikeet should use `/directory` to
identify the requester by email and apply these rules before choosing an API
call:

| Requester | Allowed workflow actions                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin     | Any school record and configuration action above.                                                                                                                                 |
| Teacher   | Attendance, reports, and day-to-day work only for classrooms in their current assignments. Do not permit profile corrections, guardian management, classroom setup, or transfers. |
| Guardian  | Only their own contact information and records for children returned under their guardian entry. Do not expose other children, staff, or classroom setup.                         |

All external writes are audit-logged with the API key ID—never the key secret or
request payload. Treat the key as a production credential: keep it in
Lorikeet's secret store, never in browser code or source control, and revoke it
immediately if it is exposed.

## Common request bodies

Create and enroll a child:

```json
{
  "firstName": "Ari",
  "lastName": "Rivera",
  "birthDate": "2021-04-15",
  "classroomId": "CLASSROOM_UUID"
}
```

Move a child:

```json
{
  "classroomId": "NEW_CLASSROOM_UUID",
  "startDate": "2026-09-01"
}
```

Link a guardian:

```json
{
  "guardianId": "GUARDIAN_UUID",
  "relationship": "mother",
  "isPrimaryContact": true,
  "receivesReports": true
}
```
