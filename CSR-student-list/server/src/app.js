import express from 'express';
import { readStudents, writeStudents } from './store.js';
import { validateStudent } from './validation/student.js';

const app = express();
app.use(express.json());

const sendError = (res, status, message, fields) => res.status(status).json({ error: { message, ...(fields ? { fields } : {}) } });

app.get('/api/students', async (_req, res, next) => {
  try { res.json({ data: await readStudents() }); } catch (error) { next(error); }
});

app.post('/api/students', async (req, res, next) => {
  try {
    const students = await readStudents();
    const { student, fields } = validateStudent(req.body, students);
    if (Object.keys(fields).length) return sendError(res, 422, 'Validation failed.', fields);
    students.push(student); await writeStudents(students);
    res.status(201).json({ data: student });
  } catch (error) { next(error); }
});

app.put('/api/students/:id', async (req, res, next) => {
  try {
    const students = await readStudents();
    const index = students.findIndex((student) => student.id === req.params.id);
    if (index === -1) return sendError(res, 404, 'Student not found.');
    const { student, fields } = validateStudent({ ...req.body, id: req.params.id }, students, req.params.id);
    if (Object.keys(fields).length) return sendError(res, 422, 'Validation failed.', fields);
    students[index] = student; await writeStudents(students);
    res.json({ data: student });
  } catch (error) { next(error); }
});

app.delete('/api/students/:id', async (req, res, next) => {
  try {
    const students = await readStudents();
    const remaining = students.filter((student) => student.id !== req.params.id);
    if (remaining.length === students.length) return sendError(res, 404, 'Student not found.');
    await writeStudents(remaining); res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  sendError(res, 500, 'The server could not complete that request. Please try again.');
});

export default app;
