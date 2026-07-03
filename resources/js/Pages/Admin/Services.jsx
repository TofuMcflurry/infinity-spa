import { useState, useEffect, useRef } from 'react';
import {
    Plus, Pencil, Archive, ImagePlus, X, Loader2,
    Power, AlertTriangle, RotateCcw,
} from 'lucide-react';
import AdminLayout from '@/Layouts/AdminLayout';

// ── API helpers ───────────────────────────────────────────────────────────────
function getCsrf() {
    const cookie = document.cookie.split('; ').find(r => r.startsWith('XSRF-TOKEN='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : '';
}

async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-XSRF-TOKEN': getCsrf(),
            ...(options.headers ?? {}),
        },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.message || `HTTP ${res.status}`);
        err.errors = data.errors;
        throw err;
    }
    return data;
}

function formatCurrency(value) {
    return new Intl.NumberFormat('en-AE', {
        style: 'currency', currency: 'AED',
        minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(value || 0);
}

const EMPTY_FORM = {
    id: null, name: '', description: '',
    category: '', group_name: '', is_active: true,
    variants: [{ id: null, duration_minutes: 60, price: '', is_active: true }],
};

// ── Toggle Switch component ───────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className="relative flex-shrink-0" style={{ width: 40, height: 24 }}>
                <button
                    type="button"
                    role="switch"
                    aria-checked={value}
                    onClick={() => onChange(!value)}
                    className="absolute inset-0 rounded-full transition-colors duration-200"
                    style={{ background: value ? '#e2b764' : 'var(--theme-border)' }}
                />
                <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                    style={{ transform: value ? 'translateX(16px)' : 'translateX(0px)' }}
                />
            </div>
            {label && (
                <span className="text-sm" style={{ color: 'var(--theme-text-head)' }}>{label}</span>
            )}
        </label>
    );
}

// ── Service Modal ─────────────────────────────────────────────────────────────
function ServiceModal({ open, onClose, onSaved, service }) {
    const [form, setForm]                 = useState(EMPTY_FORM);
    const [imageFile, setImageFile]       = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [removeImage, setRemoveImage]   = useState(false);
    const [saving, setSaving]             = useState(false);
    const [errors, setErrors]             = useState({});
    const fileRef = useRef(null);
    const isEdit  = !!service;

    useEffect(() => {
        if (!open) return;
        if (service) {
            setForm({
                id:          service.id,
                name:        service.name ?? '',
                description: service.description ?? '',
                category:    service.category ?? '',
                group_name:  service.group_name ?? '',
                is_active:   service.is_active ?? true,
                variants:    service.variants?.length
                    ? service.variants.map(v => ({
                        id:               v.id,
                        duration_minutes: v.duration_minutes,
                        price:            v.price,
                        is_active:        v.is_active,
                    }))
                    : [{ id: null, duration_minutes: 60, price: '', is_active: true }],
            });
            setImagePreview(service.image_url ?? null);
        } else {
            setForm(EMPTY_FORM);
            setImagePreview(null);
        }
        setImageFile(null);
        setRemoveImage(false);
        setErrors({});
    }, [open, service]);

    if (!open) return null;

    const setVariant = (i, key, val) => {
        setForm(f => {
            const variants = [...f.variants];
            variants[i] = { ...variants[i], [key]: val };
            return { ...f, variants };
        });
    };

    const addVariant = () => setForm(f => ({
        ...f,
        variants: [...f.variants, { id: null, duration_minutes: '', price: '', is_active: true }],
    }));

    const handleImage = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageFile(file);
        setRemoveImage(false);
        setImagePreview(URL.createObjectURL(file));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const fd = new FormData();
        fd.append('name',        form.name);
        fd.append('description', form.description ?? '');
        fd.append('category',    form.category ?? '');
        fd.append('group_name',  form.group_name ?? '');
        fd.append('is_active',   form.is_active ? '1' : '0');
        if (imageFile)   fd.append('image', imageFile);
        if (removeImage) fd.append('remove_image', '1');

        form.variants.forEach((v, i) => {
            if (v.id) fd.append(`variants[${i}][id]`, v.id);
            fd.append(`variants[${i}][duration_minutes]`, v.duration_minutes);
            fd.append(`variants[${i}][price]`,            v.price);
            fd.append(`variants[${i}][is_active]`,        v.is_active ? '1' : '0');
        });

        try {
            let saved;
            if (isEdit) {
                fd.append('_method', 'put');
                saved = await apiFetch(`/admin/api/services/${form.id}`, { method: 'POST', body: fd });
            } else {
                saved = await apiFetch('/admin/api/services', { method: 'POST', body: fd });
            }
            onSaved(saved, isEdit);
            onClose();
        } catch (err) {
            setErrors(err.errors ?? { general: [err.message] });
        } finally {
            setSaving(false);
        }
    };

    const fe = (key) => errors?.[key]?.[0];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
            <div
                className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
                style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
            >
                {/* Header */}
                <div
                    className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b backdrop-blur-xl"
                    style={{ borderColor: 'var(--theme-border)', background: 'var(--theme-notif-bg)' }}
                >
                    <h2 className="text-base font-display font-bold" style={{ color: 'var(--theme-text-head)' }}>
                        {isEdit ? 'Edit Service' : 'Add New Service'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                    >
                        <X size={15} style={{ color: 'var(--theme-text-2)' }} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {errors.general && (
                        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                            {errors.general[0]}
                        </div>
                    )}

                    {/* Image — full width clickable area */}
                    <div>
                        <label className="text-xs font-semibold block mb-2" style={{ color: 'var(--theme-text-2)' }}>
                            Service Image
                        </label>
                        <div
                            className="relative w-full h-40 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer group"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)' }}
                            onClick={() => fileRef.current?.click()}
                        >
                            {imagePreview
                                ? <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                                : (
                                    <div className="flex flex-col items-center gap-2">
                                        <ImagePlus size={24} style={{ color: 'var(--theme-text-muted)', opacity: 0.5 }} />
                                        <span className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                            Click to upload image
                                        </span>
                                    </div>
                                )
                            }
                            <div
                                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ background: 'rgba(0,0,0,0.4)' }}
                            >
                                <span className="text-xs font-semibold text-white">Change image</span>
                            </div>
                        </div>
                        {imagePreview && (
                            <button
                                type="button"
                                onClick={() => { setImageFile(null); setImagePreview(null); setRemoveImage(true); if (fileRef.current) fileRef.current.value = ''; }}
                                className="text-xs mt-1.5"
                                style={{ color: '#ef4444' }}
                            >
                                Remove image
                            </button>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
                    </div>

                    {/* Name */}
                    <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                            Service Name *
                        </label>
                        <input
                            type="text"
                            required
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="e.g. Couple Massage"
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                            style={{
                                background: 'var(--theme-btn-bg)',
                                border: `1px solid ${fe('name') ? '#ef4444' : 'var(--theme-border)'}`,
                                color: 'var(--theme-text-head)',
                            }}
                        />
                        {fe('name') && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{fe('name')}</p>}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                            Description
                        </label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={3}
                            placeholder="Short description of the service..."
                            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-none"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                        />
                    </div>

                    {/* Category + Group Name */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                                Category
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. massage"
                                value={form.category}
                                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--theme-text-2)' }}>
                                Group Name
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Couple Massage"
                                value={form.group_name}
                                onChange={e => setForm(f => ({ ...f, group_name: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                                style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                            />
                        </div>
                    </div>

                    {/* Variants */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <label className="text-xs font-semibold" style={{ color: 'var(--theme-text-2)' }}>
                                    Duration &amp; Pricing *
                                </label>
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--theme-text-muted)' }}>
                                    Toggle off to mark as unavailable to customers
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addVariant}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                                style={{
                                    background: 'rgba(226,183,100,0.1)',
                                    border: '1px solid rgba(226,183,100,0.2)',
                                    color: '#e2b764',
                                }}
                            >
                                <Plus size={11} /> Add option
                            </button>
                        </div>

                        <div className="space-y-2">
                            {form.variants.map((v, i) => (
                                <div
                                    key={i}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                                    style={{
                                        background: 'var(--theme-btn-bg)',
                                        border: `1px solid ${v.is_active ? 'var(--theme-border)' : 'rgba(148,163,184,0.15)'}`,
                                        opacity: v.is_active ? 1 : 0.55,
                                    }}
                                >
                                    {/* Duration input */}
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="60"
                                            value={v.duration_minutes}
                                            onChange={e => setVariant(i, 'duration_minutes', e.target.value)}
                                            className="w-16 px-2 py-1 rounded-lg text-xs outline-none text-center font-medium"
                                            style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                                        />
                                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }}>min</span>
                                    </div>

                                    <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--theme-border)' }} />

                                    {/* Price input */}
                                    <div className="flex items-center gap-1.5 flex-1">
                                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--theme-text-muted)' }}>AED</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            placeholder="0"
                                            value={v.price}
                                            onChange={e => setVariant(i, 'price', e.target.value)}
                                            className="w-full px-2 py-1 rounded-lg text-xs outline-none text-right font-medium"
                                            style={{ background: 'var(--theme-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                                        />
                                    </div>

                                    <div className="w-px h-4 flex-shrink-0" style={{ background: 'var(--theme-border)' }} />

                                    {/* Toggle available/unavailable */}
                                    <div className="relative flex-shrink-0" style={{ width: 32, height: 18 }}>
                                        <button
                                            type="button"
                                            onClick={() => setVariant(i, 'is_active', !v.is_active)}
                                            className="absolute inset-0 rounded-full transition-colors duration-200"
                                            style={{ background: v.is_active ? '#e2b764' : 'var(--theme-border)' }}
                                            title={v.is_active ? 'Mark as unavailable' : 'Mark as available'}
                                        />
                                        <span
                                            className="absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform duration-200"
                                            style={{
                                                width: 14, height: 14,
                                                transform: v.is_active ? 'translateX(14px)' : 'translateX(0px)',
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Helper note */}
                        <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: 'var(--theme-text-muted)' }}>
                            <span style={{ color: '#e2b764' }}>●</span>
                            Toggled-off options will show as "Unavailable" to customers — booking history is preserved.
                        </p>

                        {fe('variants') && <p className="text-[10px] mt-1" style={{ color: '#ef4444' }}>{fe('variants')}</p>}
                    </div>

                    {/* Service active toggle */}
                    <div className="pt-1 border-t" style={{ borderColor: 'var(--theme-border)' }}>
                        <Toggle
                            value={form.is_active}
                            onChange={val => setForm(f => ({ ...f, is_active: val }))}
                            label={form.is_active ? 'Active — visible to customers' : 'Inactive — hidden from customers'}
                        />
                    </div>

                    {/* Footer */}
                    <div className="flex items-center gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {isEdit ? 'Save Changes' : 'Add Service'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Archive Confirmation Modal ─────────────────────────────────────────────────
function ArchiveModal({ open, onClose, onConfirm, service, loading, error }) {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
            <div
                className="relative w-full max-w-sm rounded-2xl p-5"
                style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
            >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: 'rgba(226,183,100,0.1)' }}>
                    <AlertTriangle size={20} style={{ color: '#e2b764' }} />
                </div>
                <h3 className="text-sm font-display font-bold mb-1" style={{ color: 'var(--theme-text-head)' }}>
                    Archive "{service?.name}"?
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--theme-text-muted)' }}>
                    The service will be hidden from customers but all booking history will be preserved.
                    You can restore it anytime.
                </p>
                {error && (
                    <div className="text-xs px-3 py-2 rounded-lg mb-3"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                        {error}
                    </div>
                )}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold"
                        style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                        style={{ background: 'rgba(226,183,100,0.15)', border: '1px solid rgba(226,183,100,0.3)', color: '#e2b764' }}
                    >
                        {loading && <Loader2 size={14} className="animate-spin" />}
                        Archive
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Service Card ──────────────────────────────────────────────────────────────
function ServiceCard({ service, onEdit, onArchive, onToggle }) {
    return (
        <div
            className="rounded-2xl overflow-hidden flex flex-col"
            style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
        >
            {/* Image */}
            <div className="relative h-44 flex items-center justify-center"
                style={{ background: 'var(--theme-btn-bg)' }}>
                {service.image_url
                    ? <img src={service.image_url} alt={service.name} className="w-full h-full object-cover" />
                    : <ImagePlus size={28} style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                }
                {service.category && (
                    <div
                        className="absolute top-2.5 left-2.5 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                        style={{
                            background: 'rgba(11,17,32,0.72)',
                            backdropFilter: 'blur(4px)',
                            border: '1px solid rgba(226,183,100,0.25)',
                            color: '#e2b764',
                        }}
                    >
                        {service.category}
                    </div>
                )}
                {!service.is_active && (
                    <div
                        className="absolute top-2.5 right-2.5 text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
                        style={{ background: 'rgba(0,0,0,0.65)', color: '#94a3b8' }}
                    >
                        Inactive
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="p-4 flex-1 flex flex-col">
                <h3 className="text-sm font-display font-bold mb-1" style={{ color: 'var(--theme-text-head)' }}>
                    {service.name}
                </h3>
                {service.description && (
                    <p className="text-xs mb-3 line-clamp-2 leading-relaxed" style={{ color: 'var(--theme-text-muted)' }}>
                        {service.description}
                    </p>
                )}

                <div className="border-t my-3" style={{ borderColor: 'var(--theme-border)' }} />

                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                    style={{ color: 'var(--theme-text-muted)', opacity: 0.7 }}>
                    Duration &amp; pricing
                </p>
                <div className="space-y-1.5 mb-4">
                    {service.variants?.map(v => (
                        <div
                            key={v.id}
                            className="flex items-center justify-between px-3 py-2 rounded-lg"
                            style={{
                                background: 'var(--theme-btn-bg)',
                                opacity: v.is_active ? 1 : 0.5,
                            }}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: v.is_active ? '#e2b764' : '#94a3b8' }}
                                />
                                <span className="text-xs" style={{ color: 'var(--theme-text-2)' }}>
                                    {v.duration_minutes} min
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {!v.is_active && (
                                    <span
                                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                                        style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}
                                    >
                                        Unavailable
                                    </span>
                                )}
                                <span className="text-xs font-semibold" style={{ color: 'var(--theme-text-head)' }}>
                                    {formatCurrency(v.price)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="mt-auto flex items-center justify-between">
                    <div
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium"
                        style={{
                            background: service.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)',
                            border: `1px solid ${service.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(148,163,184,0.2)'}`,
                            color: service.is_active ? '#22c55e' : '#94a3b8',
                        }}
                    >
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: service.is_active ? '#22c55e' : '#94a3b8' }}
                        />
                        {service.is_active ? 'Active' : 'Inactive'}
                    </div>

                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => onToggle(service)}
                            title={service.is_active ? 'Deactivate' : 'Activate'}
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{
                                background: 'var(--theme-btn-bg)',
                                border: '1px solid var(--theme-border)',
                                color: service.is_active ? '#22c55e' : 'var(--theme-text-muted)',
                            }}
                        >
                            <Power size={12} />
                        </button>
                        <button
                            onClick={() => onEdit(service)}
                            title="Edit"
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-2)' }}
                        >
                            <Pencil size={12} />
                        </button>
                        <button
                            onClick={() => onArchive(service)}
                            title="Archive"
                            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
                            style={{
                                background: 'rgba(226,183,100,0.08)',
                                border: '1px solid rgba(226,183,100,0.2)',
                                color: '#e2b764',
                            }}
                        >
                            <Archive size={12} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Services() {
    const [services, setServices]         = useState([]);
    const [loading, setLoading]           = useState(true);
    const [search, setSearch]             = useState('');
    const [showArchived, setShowArchived] = useState(false);
    const [modalOpen, setModalOpen]       = useState(false);
    const [editingService, setEditingService] = useState(null);
    const [archiveTarget, setArchiveTarget]   = useState(null);
    const [archiving, setArchiving]           = useState(false);
    const [archiveError, setArchiveError]     = useState(null);

    const load = (archived = false) => {
        setLoading(true);
        apiFetch(`/admin/api/services${archived ? '?archived=1' : ''}`)
            .then(setServices)
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(showArchived); }, [showArchived]);

    const handleSaved = (saved, isEdit) => {
        setServices(prev =>
            isEdit ? prev.map(s => s.id === saved.id ? saved : s) : [saved, ...prev]
        );
    };

    const handleToggle = async (service) => {
        try {
            const updated = await apiFetch(`/admin/api/services/${service.id}/toggle`, { method: 'POST' });
            setServices(prev => prev.map(s => s.id === updated.id ? updated : s));
        } catch (err) { console.error(err); }
    };

    const handleArchiveConfirm = async () => {
        if (!archiveTarget) return;
        setArchiving(true);
        setArchiveError(null);
        try {
            await apiFetch(`/admin/api/services/${archiveTarget.id}/archive`, { method: 'POST' });
            setServices(prev => prev.filter(s => s.id !== archiveTarget.id));
            setArchiveTarget(null);
        } catch (err) {
            setArchiveError(err.message);
        } finally {
            setArchiving(false);
        }
    };

    const handleRestore = async (service) => {
        try {
            await apiFetch(`/admin/api/services/${service.id}/restore`, { method: 'POST' });
            setServices(prev => prev.filter(s => s.id !== service.id));
        } catch (err) { console.error(err); }
    };

    const filtered = services.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.category ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.group_name ?? '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <AdminLayout title="Services">
            <div className="space-y-5">

                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="Search services..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full sm:w-64 px-4 py-2.5 rounded-xl text-sm outline-none"
                            style={{ background: 'var(--theme-btn-bg)', border: '1px solid var(--theme-border)', color: 'var(--theme-text-head)' }}
                        />
                        <button
                            onClick={() => setShowArchived(a => !a)}
                            className="px-3 py-2.5 rounded-xl text-xs font-semibold flex-shrink-0 flex items-center gap-1.5"
                            style={{
                                background: showArchived ? 'rgba(226,183,100,0.1)' : 'var(--theme-btn-bg)',
                                border: `1px solid ${showArchived ? 'rgba(226,183,100,0.3)' : 'var(--theme-border)'}`,
                                color: showArchived ? '#e2b764' : 'var(--theme-text-2)',
                            }}
                        >
                            <Archive size={13} />
                            {showArchived ? 'Show Active' : 'Archived'}
                        </button>
                    </div>
                    {!showArchived && (
                        <button
                            onClick={() => { setEditingService(null); setModalOpen(true); }}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #b7882a, #e2b764)', color: '#0b1120' }}
                        >
                            <Plus size={16} /> Add Service
                        </button>
                    )}
                </div>

                {/* Grid */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <Loader2 size={28} className="animate-spin" style={{ color: '#e2b764' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-24">
                        <ImagePlus size={32} className="mx-auto mb-3" style={{ color: 'var(--theme-text-muted)', opacity: 0.3 }} />
                        <p className="text-sm" style={{ color: 'var(--theme-text-muted)' }}>
                            {search
                                ? 'No services match your search.'
                                : showArchived ? 'No archived services.' : 'No services yet. Add your first one!'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filtered.map(service => (
                            showArchived ? (
                                <div
                                    key={service.id}
                                    className="rounded-2xl p-4 flex items-center justify-between gap-3"
                                    style={{ background: 'var(--theme-notif-bg)', border: '1px solid var(--theme-border)' }}
                                >
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--theme-text-head)' }}>
                                            {service.name}
                                        </p>
                                        <p className="text-xs" style={{ color: 'var(--theme-text-muted)' }}>
                                            {service.variants?.length} variant(s)
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleRestore(service)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0"
                                        style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e' }}
                                    >
                                        <RotateCcw size={12} /> Restore
                                    </button>
                                </div>
                            ) : (
                                <ServiceCard
                                    key={service.id}
                                    service={service}
                                    onEdit={(s) => { setEditingService(s); setModalOpen(true); }}
                                    onArchive={(s) => { setArchiveTarget(s); setArchiveError(null); }}
                                    onToggle={handleToggle}
                                />
                            )
                        ))}
                    </div>
                )}
            </div>

            <ServiceModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSaved={handleSaved}
                service={editingService}
            />

            <ArchiveModal
                open={!!archiveTarget}
                onClose={() => { setArchiveTarget(null); setArchiveError(null); }}
                onConfirm={handleArchiveConfirm}
                service={archiveTarget}
                loading={archiving}
                error={archiveError}
            />
        </AdminLayout>
    );
}