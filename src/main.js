import './style.css';
import { supabase } from './supabaseClient.js';

const $ = (id) => document.getElementById(id);

let students = [];
let courses = [];
let departments = [];
let sessionVersion = 0;
let accessReady = false;

function message(text) {
  $('message').textContent = text;
}

function clearForm() {
  $('student-form').reset();
  $('student-id').value = '';
}

function render() {
  const term = $('search').value.trim().toLowerCase();

  $('student-list').replaceChildren();

  const visible = students.filter((s) =>
    `${s.student_no} ${s.first_name ?? ''} ${s.last_name ?? ''}`
      .toLowerCase()
      .includes(term)
  );

  if (!visible.length) {
    const li = document.createElement('li');
    li.textContent = 'No matching records.';
    $('student-list').append(li);
  }

  for (const s of visible) {
    const course = courses.find(
      (c) => String(c.course_id) === String(s.course_id)
    );

    const department = departments.find(
      (d) => String(d.department_id) === String(course?.department_id)
    );

    const li = document.createElement('li');
    const details = document.createElement('span');

    details.textContent =
      `${s.student_no} | ${s.first_name ?? ''} ${s.last_name ?? ''}` +
      ` | Year ${s.year_level ?? 'N/A'}` +
      ` | ${s.email}` +
      ` | ${course?.course_code ?? s.course ?? 'No course'}` +
      ` | ${department?.department_name ?? course?.department_name ?? 'No department'}`;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Edit';

    edit.onclick = () => {
      $('student-id').value = s.id;
      $('student-no').value = s.student_no;
      $('first-name').value = s.first_name ?? '';
      $('last-name').value = s.last_name ?? '';
      $('year').value = s.year_level ?? '';
      $('student-email').value = s.email;
      $('course').value = s.course_id ?? '';

      message('Editing student record. Make your changes and click Save student.');
      $('student-no').focus();
    };

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Delete';

    remove.onclick = async () => {
      if (!confirm(`Delete student ${s.student_no}?`)) return;

      const { data, error } = await supabase
        .from('students')
        .delete()
        .eq('id', s.id)
        .select('id');

      if (error) {
        message(error.message);
        return;
      }

      if (!data.length) {
        message('Nothing deleted. Check account permissions.');
        return;
      }

      await load();
      message('Student deleted successfully.');
    };

    li.append(details, edit, remove);
    $('student-list').append(li);
  }
}

async function load(version = sessionVersion) {
  const results = await Promise.all([
    supabase.from('students').select('*').order('last_name'),
    supabase.from('courses').select('*').order('course_code'),
    supabase.from('departments').select('*').order('department_name')
  ]);

  if (version !== sessionVersion) return;

  const error = results.find((r) => r.error)?.error;

  if (error) {
    message(error.message);
    return;
  }

  students = results[0].data ?? [];
  courses = results[1].data ?? [];
  departments = results[2].data ?? [];

  const selectedCourse = $('course').value;

  $('course').replaceChildren(
    new Option('Choose a course', '')
  );

  for (const c of courses) {
    $('course').add(
      new Option(`${c.course_code} - ${c.course_name ?? ''}`, c.course_id)
    );
  }

  $('course').value = selectedCourse;

  render();

  message(`${students.length} student record(s) loaded.`);
}

async function syncSession() {
  const version = ++sessionVersion;

  const { data, error } = await supabase.auth.getSession();

  if (version !== sessionVersion) return;

  accessReady = !!data.session && !error;

  $('app').hidden = !accessReady;
  $('login').hidden = accessReady;

  $('auth-message').textContent =
    error?.message ??
    (accessReady
      ? `Signed in as ${data.session.user.email}`
      : 'Sign in to continue.');

  students = [];
  courses = [];
  departments = [];

  $('student-list').replaceChildren();
  $('course').replaceChildren();
  $('report').textContent = '';

  clearForm();

  if (accessReady) {
    await load(version);
  }
}

$('login').onsubmit = async (event) => {
  event.preventDefault();

  const { error } = await supabase.auth.signInWithPassword({
    email: $('email').value.trim(),
    password: $('password').value
  });

  if (error) {
    $('auth-message').textContent = error.message;
  } else {
    $('password').value = '';
    await syncSession();
  }
};

$('logout').onclick = async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    $('auth-message').textContent = error.message;
  } else {
    await syncSession();
  }
};

$('student-form').onsubmit = async (event) => {
  event.preventDefault();

  if (!accessReady) {
    message('Please sign in first.');
    return;
  }

  const selectedCourse = courses.find(
    (c) => String(c.course_id) === $('course').value
  );

  if (!selectedCourse) {
    message('Please choose a valid course.');
    return;
  }

  const record = {
    student_no: $('student-no').value.trim(),
    first_name: $('first-name').value.trim(),
    last_name: $('last-name').value.trim(),
    course: selectedCourse.course_code,
    year_level: Number($('year').value),
    email: $('student-email').value.trim(),
    course_id: selectedCourse.course_id
  };

  if (
    !record.student_no ||
    !record.first_name ||
    !record.last_name ||
    !record.email ||
    !Number.isInteger(record.year_level) ||
    record.year_level < 1 ||
    record.year_level > 4
  ) {
    message('Complete all required fields. Year level must be 1 to 4.');
    return;
  }

  const id = $('student-id').value;

  const query = id
    ? supabase.from('students').update(record).eq('id', id)
    : supabase.from('students').insert(record);

  const { data, error } = await query.select('id');

  if (error) {
    message(error.message);
    return;
  }

  if (!data?.length) {
    message('Nothing saved. Check account permissions.');
    return;
  }

  clearForm();
  await load();
  message('Student saved successfully.');
};

$('clear').onclick = () => {
  clearForm();
  message('Form cleared.');
};

$('refresh').onclick = () => load();

$('search').oninput = render;

$('count').onclick = async () => {
  const courseId = $('course').value;

  if (!courseId) {
    $('report').textContent = 'Choose a course first.';
    return;
  }

  const { count, error } = await supabase
    .from('students')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);

  $('report').textContent = error
    ? error.message
    : `Total students in ${$('course').selectedOptions[0].text}: ${count}`;
};

supabase.auth.onAuthStateChange(() => {
  setTimeout(() => {
    syncSession().catch((error) => {
      $('auth-message').textContent = error.message;
    });
  }, 0);
});

syncSession().catch((error) => {
  $('auth-message').textContent = error.message;
});