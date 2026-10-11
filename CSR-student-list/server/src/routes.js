import { Router } from 'express';
import { readStudents, writeStudents } from './store.js';
import { editableFields, studentFields, validateStudent } from './validation/student.js';

const router = Router();
const fail = (res, status, code, message, fields) => res.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });

router.get('/', async (_req, res, next) => {
  try { res.json({ data: await readStudents() }); } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const student = (await readStudents()).find((item) => item.id === req.params.id);
    if (!student) return fail(res, 404, 'NOT_FOUND', 'Student not found.');
    res.json({ data: student });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const students = await readStudents();
    const { student, fields } = validateStudent(req.body, students);
    if (Object.keys(fields).length) return fail(res, 400, 'VALIDATION_ERROR', 'Check the submitted fields.', fields);
    const complete = Object.fromEntries(studentFields.map((key) => [key, student[key]]));
    await writeStudents([...students, complete]);
    res.location(`/api/students/${encodeURIComponent(complete.id)}`).status(201).json({ data: complete });
  } catch (error) { next(error); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const students = await readStudents();
    const index = students.findIndex((item) => item.id === req.params.id);
    if (index < 0) return fail(res, 404, 'NOT_FOUND', 'Student not found.');
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return fail(res, 400, 'VALIDATION_ERROR', 'Check the submitted fields.', { _form: 'Submit a JSON object.' });
    const keys = Object.keys(req.body);
    if (!keys.length) return fail(res, 400, 'VALIDATION_ERROR', 'Check the submitted fields.', { _form: 'PATCH must include at least one editable field.' });
    const invalidKeys = keys.filter((key) => !editableFields.includes(key));
    const { student: normalizedChanges, fields } = validateStudent(req.body, students, req.params.id, { partial: true });
    if (invalidKeys.length) {
      for (const key of invalidKeys) fields[key] = key === 'id' ? 'Student ID cannot be changed.' : 'Unknown field.';
    }
    if (Object.keys(fields).length) return fail(res, 400, 'VALIDATION_ERROR', 'Check the submitted fields.', fields);
    // Partial validation normalizes the full student shape. Merge only keys the
    // caller supplied so its empty placeholder ID cannot overwrite the stored ID.
    const changes = Object.fromEntries(keys.filter((key) => editableFields.includes(key)).map((key) => [key, normalizedChanges[key]]));
    const { student: complete, fields: completeErrors } = validateStudent({ ...students[index], ...changes }, students, req.params.id);
    if (Object.keys(completeErrors).length) return fail(res, 400, 'VALIDATION_ERROR', 'Check the submitted fields.', completeErrors);
    const updated = Object.fromEntries(studentFields.map((key) => [key, complete[key]]));
    const nextStudents = [...students];
    nextStudents[index] = updated;
    await writeStudents(nextStudents);
    res.json({ data: updated });
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const students = await readStudents();
    const remaining = students.filter((student) => student.id !== req.params.id);
    if (remaining.length === students.length) return fail(res, 404, 'NOT_FOUND', 'Student not found.');
    await writeStudents(remaining);
    res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
