# Evidence: Server-Rendered Student List

## Group 14

| Student ID | Name |
| --- | --- |
| 24127238 | Ngô Huỳnh Thắm |
| 24127128 | Nguyễn Cao Thông |
| 23127081 | Nguyễn Phan Hùng Linh |

**Course:** CSC13008 — Web Development  
**Project:** StudentPulse / SSR Student List

## Exercise requirements

Build a student directory using server-side rendering (SSR). The server reads stored student data, renders a template with a `students` array, and returns complete HTML. A form submission must be validated and saved before redirecting to the list to avoid resubmission on refresh.

| Requirement | Implementation evidence |
| --- | --- |
| `GET /students`: read student data | `readStudents()` in [app.js](app.js) reads and parses [data/student.json](data/student.json). |
| Render a template with a students array | `renderStudentList()` passes the list state, including `students`, to `res.render('students', ...)`. |
| Return final HTML | Express and EJS render [views/students.ejs](views/students.ejs) on the server; the template loops over `students` to produce table rows. |
| `POST /students`: read and validate the form body | `express.urlencoded({ extended: false })` parses the submitted form; `validateStudent()` validates and normalizes `req.body`. |
| Add a valid student | The route appends the student and calls `writeStudents()` to persist the array in JSON. |
| Redirect after successful creation | The route returns `res.redirect(303, ...)` to `/students`, followed by a GET request. |

## Stage 1 — Research and choose the technology stack

### Server stack options

The following are suitable alternatives considered for this exercise. The advantages and disadvantages are assessments of their fit for this small project.

| Stack | How it produces SSR pages | Advantages for this exercise | Disadvantages for this exercise |
| --- | --- | --- | --- |
| **Node.js + Express + EJS** | Express handles requests and passes data to EJS, which generates HTML. | JavaScript on both server and client; a small setup makes routes and rendering easy to inspect. | Validation and file persistence must be implemented explicitly. |
| **Python + Django + Django templates** | A view retrieves data and renders an HTML template with a context object. | Integrated data models and reusable templates are useful for a larger directory. | Requires Python and additional framework conventions for a small JavaScript-focused exercise. |
| **PHP + Laravel + Blade** | Routes or controllers pass data to Blade views, which compile to PHP and produce HTML. | Reusable layouts and an established framework structure support larger applications. | Requires a PHP environment and more setup than this exercise needs. |

These rendering mechanisms are described in the official [Express guide](https://expressjs.com/en/guide/using-template-engines/), [Django overview](https://docs.djangoproject.com/en/stable/intro/overview/), and [Laravel Blade documentation](https://laravel.com/framework/docs/12.x/blade).

### Template engine options for Express

| Engine | How it works | Advantages | Disadvantages |
| --- | --- | --- | --- |
| **EJS** | Embeds JavaScript expressions and control flow in ordinary HTML. | Familiar HTML and JavaScript; straightforward loops, conditions, and partials. | Too much JavaScript in templates can make presentation code harder to maintain. |
| **Pug** | Uses an indentation-based template syntax to generate HTML. | Concise markup. | Requires learning a syntax different from ordinary HTML. |
| **Handlebars** | Uses expressions, blocks, and helpers inside HTML templates. | Encourages keeping application logic outside templates. | More complex display logic may require custom helpers. |

Sources: [EJS documentation](https://ejs.co/), [Pug getting started](https://pugjs.org/api/getting-started.html), and [Handlebars guide](https://handlebarsjs.com/guide/).

### Data storage options

| Storage | How it works | Advantages | Disadvantages |
| --- | --- | --- | --- |
| **JSON file** | Parse a file into an array; modify the array and serialize it back to disk. | Human-readable data; no database installation or schema setup; easy to inspect during marking. | This implementation reads and rewrites the whole file, uses blocking file operations, and has no database transactions or unique constraints. |
| **SQLite** | Store records in a local database file and query them with SQL. | Supports transactions, queries, and database constraints without a separate database server. | Requires a schema and database integration; only one writer can write at a time. |

Node provides the file APIs used by the JSON implementation; synchronous calls block the event loop. SQLite supports local application storage but serializes concurrent writers. Sources: [Node.js file system documentation](https://nodejs.org/api/fs.html) and [appropriate uses for SQLite](https://www.sqlite.org/whentouse.html).

### Selected stack and reasons

The selected stack is **Node.js + Express + EJS + JSON**. EJS combines familiar HTML with JavaScript, Express provides clear GET and POST handlers, and JSON keeps the small dataset visible without database setup. This makes the SSR request, rendering, validation, persistence, and redirect steps easy to demonstrate.

[package.json](package.json) declares Express `^4.21.2` and EJS `^3.1.10`. Bootstrap `5.3.3` and custom CSS provide the interface. Browser JavaScript adds form feedback and row highlighting; the student list itself is rendered on the server.

## Stage 2 — Implementation and prompts

The prompts below are concise reconstructions of the implementation requests, rather than verbatim transcripts.

### Main implementation prompt

```text
Build an SSR student directory for a Web Development exercise using
Node.js, Express, EJS (HTML + JavaScript), and data/student.json.

GET /students must read the JSON array, render an EJS template with
students, and return complete HTML. POST /students must parse the form,
validate it, save a valid student, then redirect with HTTP 303.

Fields: id, name, email, dob, major. All are required after trimming.
ID: unique, case-sensitive, letters/numbers/hyphens only.
Name: at least two characters.
Email: valid basic format, unique ignoring case, saved in lowercase.
DOB: a real YYYY-MM-DD date, not in the future.
Major: nonempty text.

Validate in the browser for feedback and independently on the server.
Show field errors, preserve input, and do not save invalid submissions.
After creation, return to the list, scroll to the new row, and briefly
highlight it. Preserve sorting; clear filters that would hide the row.

Rules: keep data handling and validation outside templates; escape
student values in EJS; encode URL parameters; reuse validation for edit;
keep the student ID unchanged during edits; verify the main flows.
```

### Follow-up prompts

**UI and reference image:**

```text
Create a simple, responsive UI using the navy-blue reference image as
visual guidance. Use navy, cream, and orange consistently. Make Create
Student prominent with readable text, and use a modal for its form.
```

**Sorting and filtering:**

```text
Extend GET /students with sortBy, sortDirection, and major query
parameters. Make each data-column heading toggle ascending/descending
sorting. Put a compact filter icon in the Major header; open a popover
with major choices and All majors. Keep sorting and filtering together
without increasing the table header height.
```

**View, edit, and delete:**

```text
Add GET /students/:id for details, GET /students/:id/edit for the edit
form, POST /students/:id to validate and save edits, and
POST /students/:id/delete to delete after browser confirmation.
Return 404 for missing students and redirect after successful changes.
```

### Implemented files

| File | Responsibility |
| --- | --- |
| [app.js](app.js) | Express setup, routes, data access, validation, list state, and redirects. |
| [data/student.json](data/student.json) | Persistent array of student records. |
| [views/students.ejs](views/students.ejs) | SSR table, sorting links, major filter popover, creation modal, and error messages. |
| [views/student-detail.ejs](views/student-detail.ejs) | Student detail page. |
| [views/student-edit.ejs](views/student-edit.ejs) | Edit form and server validation feedback. |
| [views/home.ejs](views/home.ejs), [views/partials/header.ejs](views/partials/header.ejs) | Landing page and shared navigation. |
| [public/student-validation.js](public/student-validation.js) | Client validation and field feedback for create and edit forms. |
| [public/student-list.js](public/student-list.js) | Scroll, focus, highlight, and URL cleanup after creation. |
| [public/styles.css](public/styles.css) | Shared theme, responsive layouts, and new-row animation. |
| [tests/student-flow.test.js](tests/student-flow.test.js) | Automated checks of validation, creation redirects, and row behavior. |

## Stage 3 — Review of the implementation and learning

### How SSR works

For `GET /students`, the server reads the JSON file, applies the requested filter and sorting, and passes the resulting `students` array to EJS. The template generates complete table markup before Express sends the response. The browser receives HTML containing the student records; it does not fetch a JSON API to build the list.

Sorting and filtering reuse this same GET route. For example:

```text
/students?sortBy=name&sortDirection=desc&major=Computer%20Science
```

The sortable fields are `id`, `name`, `email`, `dob`, and `major`. An unsupported sort field defaults to `id`; the default direction is ascending. Major filtering matches an existing major exactly. Sorting uses `localeCompare()` with numeric comparison and case-insensitive comparison. Header links toggle direction and preserve the selected major; filter links preserve sorting.

### How form validation works

| Field | Actual validation rules |
| --- | --- |
| `id` | Required after trimming; matches `^[A-Za-z0-9-]+$`; unique using case-sensitive comparison. Stored as a string. |
| `name` | Required after trimming; at least two characters. Names do not have to be unique. |
| `email` | Required; matches the basic pattern `^\S+@\S+\.\S+$`; unique ignoring case. Trimmed and saved in lowercase. |
| `dob` | Required; matches `YYYY-MM-DD`; parses successfully; matches its ISO date after parsing to reject impossible dates; must not be in the future. There is no minimum-age rule. |
| `major` | Required after trimming. Free text; multiple students may share a major. |

On the **client**, forms marked `data-student-validation` are processed by `student-validation.js`. Fields are checked on blur, rechecked while correcting an error, and checked again on submit. Invalid fields receive an `is-invalid` class, `aria-invalid`, and a feedback message prefixed with `CLIENT:`. Invalid submission is prevented and focus moves to the first invalid field. Existing IDs and emails are passed through form data attributes for duplicate checks. The edit form allows the student's current email.

The forms use `novalidate` so the custom JavaScript controls validation feedback. Attributes such as `required`, `type="email"`, and `type="date"` still describe the expected inputs.

On the **server**, `validateStudent()` independently checks every submitted value. Non-string inputs become empty strings, text is trimmed, and email is normalized. Invalid creation returns **422**, preserves entered values, and reopens the creation modal with errors. Invalid editing returns **422** with the edit form. Neither invalid path writes to the data file.

During editing, the route supplies the ID from the URL, so it cannot be changed through the form. Duplicate checks exclude that same student. Server validation remains necessary because client checks can be bypassed and their copy of existing records can become outdated.

### How the successful POST redirect works

1. `POST /students` reads the current records and validates the submitted body.
2. If validation succeeds, it appends the normalized student and writes the updated JSON array.
3. It constructs a list URL containing validated sorting settings, `created=<id>`, and `#student-<id>`. A major filter is retained only if it includes the new record.
4. It returns **303 See Other**, directing the browser to retrieve the list with GET. Refreshing that page repeats GET instead of the successful POST. This follows the Post/Redirect/Get pattern; the redirect semantics are defined in [RFC 9110, section 15.4.4](https://www.rfc-editor.org/rfc/rfc9110.html#name-303-see-other).
5. The GET handler verifies that the `created` ID exists, displays a success notice, and marks the corresponding row with `data-created-student` and a focusable `tabindex`.
6. `student-list.js` scrolls to the row, focuses it, and applies the highlight class for **3.5 seconds**. Reduced-motion preferences disable smooth scrolling and the animation.
7. `history.replaceState()` removes the creation marker and fragment while retaining sorting and filtering, so a subsequent refresh does not repeat the notice or highlight.

For example, creating student `S2` while sorted by name descending redirects to:

```text
/students?sortBy=name&sortDirection=desc&created=S2#student-S2
```

The highlight and success notice use a URL marker, not session-based flash-message middleware. A failed file write returns **500** with a form error instead of a success redirect.

### Routes and HTTP methods

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/` | Render the landing page. |
| GET | `/students` | Read records; apply sorting/filtering; render the list and creation form. |
| POST | `/students` | Validate and create; return 422 for invalid input or 303 to the list after saving. |
| GET | `/students/:id` | Render details; return 404 if the ID does not exist. |
| GET | `/students/:id/edit` | Render the populated edit form; return 404 if missing. |
| POST | `/students/:id` | Validate and update; return 422 for invalid input, 404 if missing, or 302 to the detail page after saving. |
| POST | `/students/:id/delete` | Delete and persist; return 404 if missing or 302 to the list after saving. |

Edit and delete use POST forms. There are no separate PUT, PATCH, DELETE, sort, or filter endpoints. Browser confirmation is requested before submitting deletion.

