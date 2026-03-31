exports.handler = async function (event) {
  const task_id = event.queryStringParameters?.task_id;
  if (!task_id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'task_id obrigatório' }) };
  }

  const res = await fetch(`https://api.clickup.com/api/v2/task/${task_id}`, {
    headers: { Authorization: process.env.CLICKUP_TOKEN },
  });

  if (!res.ok) {
    return { statusCode: res.status, body: JSON.stringify({ error: 'ClickUp error' }) };
  }

  const data = await res.json();
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: data.name || null }),
  };
};
