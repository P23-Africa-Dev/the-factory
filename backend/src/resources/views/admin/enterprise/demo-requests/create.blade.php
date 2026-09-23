@extends('layouts.admin')

@section('title', 'Register Enterprise User')
@section('page-title', 'Register User')

@section('breadcrumb')
    <li class="breadcrumb-item"><a href="{{ route('admin.enterprise.demo-requests.index') }}" class="text-decoration-none"
            style="color:var(--text-muted)">Enterprise Requests</a></li>
    <li class="breadcrumb-item active">Register User</li>
@endsection

@section('content')

    <div class="row g-3">
        <div class="col-lg-8">
            <div class="metric-card p-4">
                <div class="section-label"><i class="bi bi-person-plus"></i>Direct Registration</div>
                <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-4">
                    Register a user who paid offline or never requested a demo. This creates an enterprise request and can
                    send the same activation email as the demo flow.
                </p>

                <form method="POST" action="{{ route('admin.enterprise.demo-requests.store') }}" class="d-grid gap-3"
                    id="direct-registration-form">
                    @csrf

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Full Name</label>
                            <input type="text" name="full_name"
                                class="form-control form-control-sm @error('full_name') is-invalid @enderror"
                                value="{{ old('full_name') }}" required>
                            @error('full_name')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Email</label>
                            <input type="email" name="email"
                                class="form-control form-control-sm @error('email') is-invalid @enderror"
                                value="{{ old('email') }}" required>
                            @error('email')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                    </div>

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Phone</label>
                            <input type="tel" name="phone"
                                class="form-control form-control-sm @error('phone') is-invalid @enderror"
                                value="{{ old('phone') }}" placeholder="+2348012345678" pattern="^\+[1-9][0-9]{7,14}$">
                            @error('phone')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Company Name</label>
                            <input type="text" name="company_name"
                                class="form-control form-control-sm @error('company_name') is-invalid @enderror"
                                value="{{ old('company_name') }}" required>
                            @error('company_name')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                    </div>

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Country</label>
                            <input type="text" name="country"
                                class="form-control form-control-sm @error('country') is-invalid @enderror"
                                value="{{ old('country') }}" maxlength="100" required placeholder="e.g. Nigeria">
                            @error('country')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Team Size</label>
                            <select name="team_size"
                                class="form-select form-select-sm @error('team_size') is-invalid @enderror" required>
                                @foreach (App\Enums\TeamSizeEnum::values() as $teamSize)
                                    <option value="{{ $teamSize }}" @selected(old('team_size') === $teamSize)>{{ $teamSize }}
                                    </option>
                                @endforeach
                            </select>
                            @error('team_size')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                    </div>

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Purpose</label>
                            <select name="purpose" class="form-select form-select-sm" required>
                                @foreach (App\Enums\WorkspacePurposeEnum::cases() as $purpose)
                                    <option value="{{ $purpose->value }}" @selected(old('purpose', App\Enums\WorkspacePurposeEnum::ENTERPRISE->value) === $purpose->value)>
                                        {{ $purpose->label() }}
                                    </option>
                                @endforeach
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">User Type</label>
                            <select name="user_type" class="form-select form-select-sm" required>
                                @foreach (App\Enums\UserTypeEnum::cases() as $userType)
                                    <option value="{{ $userType->value }}" @selected(old('user_type', App\Enums\UserTypeEnum::OTHER->value) === $userType->value)>
                                        {{ $userType->label() }}
                                    </option>
                                @endforeach
                            </select>
                        </div>
                    </div>

                    <div>
                        <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Admin Notes</label>
                        <textarea name="admin_notes" rows="3" class="form-control form-control-sm" placeholder="Optional internal notes">{{ old('admin_notes') }}</textarea>
                    </div>

                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Subscription
                                Plan</label>
                            <select name="assigned_plan_key" id="assigned_plan_key"
                                class="form-select form-select-sm @error('assigned_plan_key') is-invalid @enderror">
                                <option value="">No plan assigned — user chooses at checkout</option>
                                @foreach ($billingPlans as $planKey => $plan)
                                    <option value="{{ $planKey }}" @selected(old('assigned_plan_key') === $planKey)>
                                        {{ $plan['label'] }}
                                    </option>
                                @endforeach
                            </select>
                            @error('assigned_plan_key')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                        <div class="col-md-6">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Billing
                                Interval</label>
                            <select name="assigned_billing_interval" id="assigned_billing_interval"
                                class="form-select form-select-sm @error('assigned_billing_interval') is-invalid @enderror">
                                <option value="">Not set</option>
                                @foreach (App\Enums\BillingInterval::cases() as $interval)
                                    <option value="{{ $interval->value }}" @selected(old('assigned_billing_interval') === $interval->value)>
                                        {{ ucfirst($interval->value) }}
                                    </option>
                                @endforeach
                            </select>
                            @error('assigned_billing_interval')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                        </div>
                    </div>

                    <div class="p-3 rounded"
                        style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.15)">
                        <div class="form-check mb-2">
                            <input type="checkbox" name="already_paid" value="1" id="already_paid"
                                class="form-check-input" @checked(old('already_paid'))>
                            <label class="form-check-label small fw-semibold" for="already_paid">Already paid
                                (offline)</label>
                        </div>
                        <p style="font-size:.78rem;color:var(--text-secondary)" class="mb-2">
                            Mark when the customer paid privately. The system will not ask them to pay again.
                        </p>
                        <div id="payment-start-wrap" class="{{ old('already_paid') ? '' : 'd-none' }}">
                            <label class="form-label small fw-semibold mb-1" style="font-size:.78rem">Payment start
                                date</label>
                            <input type="date" name="payment_start_date" id="payment_start_date"
                                class="form-control form-control-sm @error('payment_start_date') is-invalid @enderror"
                                value="{{ old('payment_start_date') }}">
                            @error('payment_start_date')
                                <div class="invalid-feedback">{{ $message }}</div>
                            @enderror
                            <div style="font-size:.72rem;color:var(--text-muted)" class="mt-1">
                                Used to calculate the subscription renewal date from the selected billing interval.
                            </div>
                        </div>
                    </div>

                    <div class="d-flex flex-wrap gap-2">
                        <button name="action" value="draft" class="btn btn-sm"
                            style="background:rgba(59,130,246,.1);color:#2563eb;border:1px solid rgba(59,130,246,.2)">
                            <i class="bi bi-save2 me-1"></i>Save Draft
                        </button>
                        <button name="action" value="provision" class="btn btn-sm"
                            style="background:rgba(245,158,11,.1);color:#d97706;border:1px solid rgba(245,158,11,.25)">
                            <i class="bi bi-building me-1"></i>Provision Account
                        </button>
                        <button name="action" value="activate" class="btn btn-sm"
                            style="background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.2)">
                            <i class="bi bi-check2-circle me-1"></i>Register &amp; Send Activation
                        </button>
                        <a href="{{ route('admin.enterprise.demo-requests.index') }}"
                            class="btn btn-sm btn-outline-secondary">Cancel</a>
                    </div>
                </form>
            </div>
        </div>
    </div>

    @push('scripts')
        <script>
            (function() {
                const paid = document.getElementById('already_paid');
                const wrap = document.getElementById('payment-start-wrap');
                if (!paid || !wrap) return;
                paid.addEventListener('change', function() {
                    wrap.classList.toggle('d-none', !paid.checked);
                });
            })();
        </script>
    @endpush

@endsection
