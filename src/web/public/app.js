const pendingListEl = document.getElementById('pending-list');
const emptyPendingEl = document.getElementById('empty-pending');
const pendingCountEl = document.getElementById('pending-count');
const historyListEl = document.getElementById('history-list');
const refreshHistoryBtn = document.getElementById('refresh-history');
const connectionStatusEl = document.getElementById('connection-status');
const statusDotEl = connectionStatusEl.querySelector('.status-dot');
const statusTextEl = document.getElementById('status-text');

let allRequests = [];

function setConnectionStatus(connected, text) {
  if (connected) {
    statusDotEl.className = 'status-dot connected';
    statusTextEl.textContent = text || 'Live Connected';
  } else {
    statusDotEl.className = 'status-dot disconnected';
    statusTextEl.textContent = text || 'Offline';
  }
}

async function fetchRequests() {
  try {
    const res = await fetch('/api/requests');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data.success) {
      allRequests = data.requests;
      render();
      setConnectionStatus(true);
    }
  } catch (err) {
    console.error('Failed to fetch requests:', err);
    setConnectionStatus(false, 'Disconnected');
  }
}

function render() {
  const pending = allRequests.filter(r => r.status === 'pending');
  const history = allRequests.filter(r => r.status !== 'pending');

  pendingCountEl.textContent = pending.length;

  // Render Pending List
  if (pending.length === 0) {
    pendingListEl.innerHTML = '';
    pendingListEl.appendChild(emptyPendingEl);
    emptyPendingEl.style.display = 'block';
  } else {
    emptyPendingEl.style.display = 'none';
    pendingListEl.innerHTML = pending.map(req => createCardHTML(req)).join('');

    // Attach button event listeners
    pending.forEach(req => {
      const approveBtn = document.getElementById(`approve-${req.id}`);
      const rejectBtn = document.getElementById(`reject-${req.id}`);
      const reasonInput = document.getElementById(`reason-${req.id}`);

      if (approveBtn) {
        approveBtn.addEventListener('click', () => {
          submitDecision(req.id, 'approved', reasonInput ? reasonInput.value : '');
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener('click', () => {
          submitDecision(req.id, 'rejected', reasonInput ? reasonInput.value : '');
        });
      }
    });
  }

  // Render History List
  if (history.length === 0) {
    historyListEl.innerHTML = '<p class="text-muted">No past decisions recorded yet.</p>';
  } else {
    historyListEl.innerHTML = history.slice(0, 10).map(req => {
      const timeStr = new Date(req.resolvedAt || req.createdAt).toLocaleTimeString();
      const statusClass = `status-${req.status}`;
      return `
        <div class="history-item">
          <div class="history-info">
            <span class="history-status ${statusClass}">${req.status}</span>
            <span class="history-summary" title="${escapeHtml(req.summary)}">
              <strong>${escapeHtml(req.toolName)}:</strong> ${escapeHtml(req.summary)}
            </span>
          </div>
          <div class="history-time">${timeStr}</div>
        </div>
      `;
    }).join('');
  }
}

function createCardHTML(req) {
  const timeStr = new Date(req.createdAt).toLocaleTimeString();
  let codeContent = '';

  if (req.actionType === 'command') {
    codeContent = req.payload.CommandLine || req.payload.command || JSON.stringify(req.payload, null, 2);
  } else if (req.actionType === 'file_write' || req.actionType === 'file_edit') {
    codeContent = `Path: ${req.payload.Path || req.payload.path}\nContent:\n${req.payload.Content || req.payload.Replacement || '(omitted)'}`;
  } else {
    codeContent = JSON.stringify(req.payload, null, 2);
  }

  return `
    <div class="card" id="card-${req.id}">
      <div class="card-header">
        <div class="card-badges">
          <span class="badge badge-agent">${escapeHtml(req.agent)}</span>
          <span class="badge badge-action">${escapeHtml(req.actionType)}</span>
          <span class="badge">${escapeHtml(req.toolName)}</span>
        </div>
        <span class="card-time">${timeStr}</span>
      </div>

      <div class="card-summary">${escapeHtml(req.summary)}</div>

      <pre class="code-block"><code>${escapeHtml(codeContent)}</code></pre>

      <div class="metadata-grid">
        <div><strong>Step:</strong> ${req.context?.stepIdx ?? 'N/A'}</div>
        <div><strong>Conv ID:</strong> ${escapeHtml(req.context?.conversationId ? req.context.conversationId.slice(0, 8) + '...' : 'N/A')}</div>
        <div><strong>Model:</strong> ${escapeHtml(req.context?.modelName || 'N/A')}</div>
      </div>

      <div class="reason-input-group">
        <label for="reason-${req.id}">Operator note / rejection reason (optional):</label>
        <input type="text" id="reason-${req.id}" class="reason-input" placeholder="e.g. Approved for testing, or: Destructive command not permitted">
      </div>

      <div class="card-actions">
        <button class="btn btn-reject" id="reject-${req.id}">&#x2716; Reject</button>
        <button class="btn btn-approve" id="approve-${req.id}">&#x2714; Approve</button>
      </div>
    </div>
  `;
}

async function submitDecision(requestId, decision, reason) {
  const card = document.getElementById(`card-${requestId}`);
  if (card) {
    const buttons = card.querySelectorAll('button');
    buttons.forEach(b => b.disabled = true);
  }

  try {
    const res = await fetch(`/api/requests/${requestId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason }),
    });

    if (!res.ok) {
      alert(`Error submitting decision: ${res.statusText}`);
      if (card) {
        const buttons = card.querySelectorAll('button');
        buttons.forEach(b => b.disabled = false);
      }
      return;
    }

    await fetchRequests();
  } catch (err) {
    console.error('Error submitting decision:', err);
    alert('Failed to connect to Milo server');
    if (card) {
      const buttons = card.querySelectorAll('button');
      buttons.forEach(b => b.disabled = false);
    }
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function setupSSE() {
  try {
    const evtSource = new EventSource('/api/events');

    evtSource.onopen = () => {
      setConnectionStatus(true, 'Live Connected');
    };

    evtSource.addEventListener('request_created', (event) => {
      const req = JSON.parse(event.data);
      const existingIdx = allRequests.findIndex(r => r.id === req.id);
      if (existingIdx >= 0) {
        allRequests[existingIdx] = req;
      } else {
        allRequests.unshift(req);
      }
      render();
    });

    evtSource.addEventListener('request_resolved', (event) => {
      const { request } = JSON.parse(event.data);
      const idx = allRequests.findIndex(r => r.id === request.id);
      if (idx >= 0) {
        allRequests[idx] = request;
      } else {
        allRequests.unshift(request);
      }
      render();
    });

    evtSource.onerror = () => {
      setConnectionStatus(false, 'Reconnecting...');
    };
  } catch (err) {
    console.warn('SSE not supported or failed, falling back to polling', err);
  }
}

// Initial setup
fetchRequests();
setupSSE();

// Fallback polling every 3 seconds to guarantee synchronization
setInterval(fetchRequests, 3000);

refreshHistoryBtn.addEventListener('click', fetchRequests);
