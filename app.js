let currentUser = null;
let requests = [];
let editingId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await Auth.init();
    currentUser = await Auth.getUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            window.location.href = 'login.html';
        }
    });

    initApp();
});

async function initApp() {
    await loadDashboard();
    await loadRequests();
    setupEventListeners();
}

async function loadDashboard() {
    const { count: total } = await supabaseClient
        .from('service_requests')
        .select('*', { count: 'exact', head: true });

    const { count: pending } = await supabaseClient
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Pending');

    const { count: inProgress } = await supabaseClient
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'In Progress');

    const { count: completed } = await supabaseClient
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Completed');

    document.getElementById('total-requests').textContent = total || 0;
    document.getElementById('pending-requests').textContent = pending || 0;
    document.getElementById('inprogress-requests').textContent = inProgress || 0;
    document.getElementById('completed-requests').textContent = completed || 0;
}

async function loadRequests() {
    const { data, error } = await supabaseClient
        .from('service_requests')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        showError('Failed to load requests: ' + error.message);
        return;
    }

    requests = data || [];
    applyFilters();
}

function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const statusFilter = document.getElementById('status-filter').value;
    const priorityFilter = document.getElementById('priority-filter').value;

    let filtered = requests;

    if (searchTerm) {
        filtered = filtered.filter(r =>
            r.requester_name.toLowerCase().includes(searchTerm) ||
            r.description.toLowerCase().includes(searchTerm)
        );
    }

    if (statusFilter !== 'All') {
        filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (priorityFilter !== 'All') {
        filtered = filtered.filter(r => r.priority === priorityFilter);
    }

    renderTable(filtered);
}

function renderTable(data) {
    const tbody = document.getElementById('requests-tbody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="empty-state">
                    No requests found.
                </td>
            </tr>
        `;
        return;
    }

    data.forEach(request => {
        const row = document.createElement('tr');
        const isOwner = request.user_id === currentUser.id;
        const actions = isOwner
            ? `<button class="btn btn-primary btn-small" onclick="openModal('edit', ${request.id})">Edit</button>
               <button class="btn btn-danger btn-small" onclick="confirmDelete(${request.id})">Delete</button>`
            : `<span style="color:#aaa; font-size:0.85rem;">Read-only</span>`;

        row.innerHTML = `
            <td>${request.id}</td>
            <td>${escapeHtml(request.requester_name)}</td>
            <td>${escapeHtml(request.department)}</td>
            <td>${escapeHtml(request.category)}</td>
            <td class="priority-${request.priority.toLowerCase()}">${request.priority}</td>
            <td><span class="badge badge-${request.status.toLowerCase().replace(' ', '')}">${request.status}</span></td>
            <td>${new Date(request.created_at).toLocaleDateString()}</td>
            <td>${actions}</td>
        `;
        tbody.appendChild(row);
    });
}

function setupEventListeners() {
    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('status-filter').addEventListener('change', applyFilters);
    document.getElementById('priority-filter').addEventListener('change', applyFilters);
    document.getElementById('new-request-btn').addEventListener('click', () => openModal('create'));
    document.getElementById('request-form').addEventListener('submit', saveRequest);
    document.getElementById('close-modal').addEventListener('click', closeModal);
    document.getElementById('cancel-btn').addEventListener('click', closeModal);
    document.getElementById('confirm-delete-btn').addEventListener('click', deleteRequest);
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
}

function openModal(mode, requestId = null) {
    editingId = requestId;
    const modal = document.getElementById('request-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('request-form');

    clearErrors();

    if (mode === 'edit' && requestId) {
        const request = requests.find(r => r.id === requestId);
        if (!request) return;

        title.textContent = 'Edit Request';
        document.getElementById('requester-name').value = request.requester_name;
        document.getElementById('department').value = request.department;
        document.getElementById('category').value = request.category;
        document.getElementById('description').value = request.description;
        document.getElementById('priority').value = request.priority;
        document.getElementById('status').value = request.status;
    } else {
        title.textContent = 'New Request';
        form.reset();
        document.getElementById('status').value = 'Pending';
    }

    modal.classList.add('active');
}

function closeModal() {
    document.getElementById('request-modal').classList.remove('active');
    editingId = null;
}

function clearErrors() {
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
}

function showError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = message;
}

function showErrorBanner(message) {
    const el = document.getElementById('error-message');
    el.textContent = message;
    el.classList.add('active');
}

function showSuccessBanner(message) {
    const el = document.getElementById('success-message');
    el.textContent = message;
    el.classList.add('active');
    setTimeout(() => el.classList.remove('active'), 3000);
}

function validateForm(data) {
    let isValid = true;
    clearErrors();

    if (!data.requester_name.trim()) {
        showError('error-requester-name', 'Requester name cannot be empty.');
        isValid = false;
    }

    if (!data.department.trim()) {
        showError('error-department', 'Department must be provided.');
        isValid = false;
    }

    if (!data.category) {
        showError('error-category', 'Category must be selected.');
        isValid = false;
    }

    if (!data.description.trim() || data.description.trim().length < 5) {
        showError('error-description', 'Description must contain sufficient information.');
        isValid = false;
    }

    if (!['Low', 'Medium', 'High'].includes(data.priority)) {
        showError('error-priority', 'Priority must be Low, Medium, or High.');
        isValid = false;
    }

    if (!['Pending', 'In Progress', 'Completed'].includes(data.status)) {
        showError('error-status', 'Status must be Pending, In Progress, or Completed.');
        isValid = false;
    }

    return isValid;
}

async function saveRequest(e) {
    e.preventDefault();
    clearErrors();
    document.getElementById('error-message').classList.remove('active');

    const data = {
        requester_name: document.getElementById('requester-name').value,
        department: document.getElementById('department').value,
        category: document.getElementById('category').value,
        description: document.getElementById('description').value,
        priority: document.getElementById('priority').value,
        status: document.getElementById('status').value,
    };

    if (!validateForm(data)) {
        return;
    }

    if (editingId) {
        const { error } = await supabaseClient
            .from('service_requests')
            .update(data)
            .eq('id', editingId);

        if (error) {
            showErrorBanner('Failed to update request: ' + error.message);
            return;
        }
        showSuccessBanner('Request updated successfully.');
    } else {
        data.user_id = currentUser.id;
        data.status = 'Pending';

        const { error } = await supabaseClient
            .from('service_requests')
            .insert([data]);

        if (error) {
            showErrorBanner('Failed to create request: ' + error.message);
            return;
        }
        showSuccessBanner('Request created successfully.');
    }

    closeModal();
    await loadDashboard();
    await loadRequests();
}

function confirmDelete(id) {
    document.getElementById('delete-modal').classList.add('active');
    document.getElementById('delete-id').value = id;
}

async function deleteRequest() {
    const id = parseInt(document.getElementById('delete-id').value);
    const { error } = await supabaseClient
        .from('service_requests')
        .delete()
        .eq('id', id);

    document.getElementById('delete-modal').classList.remove('active');

    if (error) {
        showErrorBanner('Failed to delete request: ' + error.message);
        return;
    }

    showSuccessBanner('Request deleted successfully.');
    await loadDashboard();
    await loadRequests();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
