import React, { useEffect, useState, useRef } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Glyphicon } from 'react-bootstrap';
import Rx from 'rxjs';
import { CLICK_ON_MAP } from '../../../actions/map';
import { addLayer, updateNode } from '../../../actions/layers';
import { getHook, GET_COORDINATES_FROM_PIXEL_HOOK } from '../../../utils/MapUtils';
import { reproject } from '../../../utils/CoordinatesUtils';

// Image-based halo (two-ring SVG) used as an Icon symbolizer
const HALO_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">'
    + '<circle cx="25" cy="25" r="20" fill="none" stroke="#5cc8ff" stroke-width="6" />'
    + '<circle cx="25" cy="25" r="16" fill="none" stroke="#0091ff" stroke-width="2" />'
    + '</svg>'
);

// Actions (scoped to this plugin)
const TOGGLE_ENTITY_PALETTE = 'entitypalette/TOGGLE';
const SET_ARMED_ITEM = 'entitypalette/SET_ARMED_ITEM';
const SET_MOVE_TARGET = 'entitypalette/SET_MOVE_TARGET';
const PLACE_AT_COORDS = 'entitypalette/PLACE_AT_COORDS';
const SET_SELECTED_ID = 'entitypalette/SET_SELECTED_ID';
const UPDATE_ICON_STYLE = 'entitypalette/UPDATE_ICON_STYLE';
const UPDATE_FEATURE_METADATA = 'entitypalette/UPDATE_FEATURE_METADATA';

export const toggleEntityPalette = () => ({ type: TOGGLE_ENTITY_PALETTE });
export const setArmedItem = (item) => ({ type: SET_ARMED_ITEM, item });
export const setMoveTarget = (id) => ({ type: SET_MOVE_TARGET, id });
export const placeAtCoords = ({ lng, lat, item }) => ({ type: PLACE_AT_COORDS, lng, lat, item });
export const setSelectedId = (id) => ({ type: SET_SELECTED_ID, id });
export const updateIconStyle = ({ id, sizeDelta = 0, rotateDelta = 0 }) => ({ type: UPDATE_ICON_STYLE, id, sizeDelta, rotateDelta });
export const updateFeatureMetadata = ({ id, name, code, faction, notes }) => ({ type: UPDATE_FEATURE_METADATA, id, name, code, faction, notes });

// Reducer
const initialState = {
    open: true,
    armedItem: null,
    moveTargetId: null,
    selectedId: null
};
export const entityPaletteReducer = (state = initialState, action) => {
    switch (action.type) {
    case TOGGLE_ENTITY_PALETTE:
        return { ...state, open: !state.open };
    case SET_ARMED_ITEM:
        return { ...state, armedItem: action.item };
    case SET_MOVE_TARGET:
        return { ...state, moveTargetId: action.id };
    case SET_SELECTED_ID:
        return { ...state, selectedId: action.id };
    default:
        return state;
    }
};

// Utils: load all images under a folder and make items
const loadGroup = (context) => context.keys().map((k) => {
    const file = k.replace('./', '');
    const label = decodeURIComponent(file.replace(/\.[^.]+$/, ''));
    const id = encodeURIComponent(label);
    const icon = context(k); // webpack returns URL string
    return { id, label, icon };
});

// Webpack contexts for assets (PNG/SVG)
let cars = [];
let people = [];
let barriers = [];
let settlers = [];
try {
    const carsCtx = require.context('../../assets/markers/cars', false, /\.(png|svg|jpg|jpeg)$/i);
    cars = loadGroup(carsCtx);
} catch (e) { /* folder may be missing during build */ }
try {
    const peopleCtx = require.context('../../assets/markers/people', false, /\.(png|svg|jpg|jpeg)$/i);
    people = loadGroup(peopleCtx);
} catch (e) { /* ignore */ }
try {
    const barriersCtx = require.context('../../assets/markers/barriers', false, /\.(png|svg|jpg|jpeg)$/i);
    barriers = loadGroup(barriersCtx);
} catch (e) { /* ignore */ }
// Settler attacks group
try {
    const settlersCtx = require.context('../../assets/markers/Settler attacks', false, /\.(png|svg|jpg|jpeg)$/i);
    settlers = loadGroup(settlersCtx);
} catch (e) { /* folder may be missing */ }

const groups = [
    { id: 'settlers', label: 'اعتداءات المستوطنين', items: settlers },
    { id: 'cars', label: 'المركبات', items: cars },
    { id: 'people', label: 'الأفراد', items: people },
    { id: 'barriers', label: 'الحواجز', items: barriers }
];

const paletteContainerStyle = {
    position: 'absolute',
    top: 50,
    left: 10,
    width: 260,
    maxHeight: '85vh',
    overflowY: 'auto',
    zIndex: 1000,
    background: 'rgba(255,255,255,0.95)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    borderRadius: 6,
    padding: 8
};

const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    cursor: 'pointer',
    borderBottom: '1px solid #eee',
    fontWeight: 600
};

const gridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 48px)',
    gridGap: 8,
    padding: 8
};

const itemStyle = {
    width: 48,
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #ddd',
    borderRadius: 4,
    background: '#fff',
    cursor: 'pointer'
};

// Small reopen button when panel is closed
const reopenButtonStyle = {
    position: 'absolute',
    top: 50,
    left: 10,
    zIndex: 1000
};
const reopenBtnStyle = {
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 4,
    boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    cursor: 'pointer'
};

function EntityPalette({ open, armedItem, entityFeatures = [], selectedId, dispatch }) {
    const [metaDraft, setMetaDraft] = useState({ name: '', code: '', faction: '', notes: '' });
    const selectedFeature = (entityFeatures || []).find(ff => ff.id === selectedId);
    // track last save time for debounce
    const lastSaveTsRef = useRef(0);
    // UI state: edit panel open/closed and last saved timestamp for feedback
    const [editOpen, setEditOpen] = useState(false);
    const [savedTs, setSavedTs] = useState(0);
    // DnD overlay active flag
    const [isDndActive, setIsDndActive] = useState(false);
    // Mouse-based fallback flags/refs
    const [isMouseDragActive, setIsMouseDragActive] = useState(false);
    const mouseStartRef = useRef({ x: 0, y: 0, t: 0 });
    const dragPayloadRef = useRef(null); // stores { item, groupId }

    // unified drag start handler (usable on both card and inner <img>)
    const handleDragStart = (item, groupId) => (e) => {
        try { e.stopPropagation(); } catch (_) { /* noop */ }
        const payload = JSON.stringify({ ...item, groupId });
        const dt = e && e.dataTransfer ? e.dataTransfer : null; // capture before React pools event
        try { dt && dt.setData('application/x-entity', payload); } catch (_) { /* noop */ }
        try { dt && dt.setData('text/plain', payload); } catch (_) { /* noop */ }
        try { dt && (dt.effectAllowed = 'copy'); } catch (_) { /* noop */ }
        // make drag image look like the icon (helps some browsers reliably start DnD)
        const img = new Image();
        img.src = item.icon;
        img.onload = () => { try { dt && dt.setDragImage(img, img.width / 2, img.height / 2); } catch (_) {} };
        // store payload for mouse fallback as well
        dragPayloadRef.current = { item, groupId };
        // diag
        try { console.log('[EntityPalette] dragStart', item?.label || item?.id); } catch (_) {}
        setIsDndActive(true);
    };

    // clear overlay when drag ends anywhere
    useEffect(() => {
        const clear = () => setIsDndActive(false);
        window.addEventListener('dragend', clear, true);
        window.addEventListener('drop', clear, true);
        return () => {
            window.removeEventListener('dragend', clear, true);
            window.removeEventListener('drop', clear, true);
        };
    }, []);

    // When dragging from palette, capture drop globally (avoids DOM stacking issues)
    useEffect(() => {
        if (!isDndActive) return;
        const onDragOver = (e) => {
            // Allow drop
            e.preventDefault();
            try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; } catch (_) { /* noop */ }
        };
        const onDrop = (e) => {
            try {
                e.preventDefault();
                e.stopPropagation();
                const raw = e.dataTransfer?.getData('application/x-entity') || e.dataTransfer?.getData('text/plain');
                if (!raw) { try { console.warn('[EntityPalette] drop without payload'); } catch (_) {} return; }
                // Element under point and find the nearest map container
                const startEl = document.elementFromPoint(e.clientX, e.clientY);
                const selectors = [
                    '.mapstore-map .leaflet-container', '.leaflet-container',
                    '.mapstore-map .leaflet-map-pane', '.leaflet-map-pane',
                    '.mapstore-map .mapboxgl-canvas', '.mapboxgl-canvas',
                    '.mapstore-map .mapboxgl-canvas-container', '.mapboxgl-canvas-container',
                    '.mapstore-map .ol-viewport', '.ol-viewport',
                    '.mapstore-map canvas', 'canvas',
                    '.mapstore-map', '#map'
                ];
                let mapEl = null;
                if (startEl && startEl.closest) {
                    for (const sel of selectors) { mapEl = startEl.closest(sel); if (mapEl) break; }
                }
                if (!mapEl) {
                    for (const sel of selectors) { mapEl = document.querySelector(sel); if (mapEl) break; }
                }
                if (!mapEl) { try { console.warn('[EntityPalette] drop: no map element found under cursor', startEl?.tagName, startEl?.className); } catch (_) {} return; }
                const rect = mapEl.getBoundingClientRect();
                const pixel = [e.clientX - rect.left, e.clientY - rect.top];
                const hook = getHook(GET_COORDINATES_FROM_PIXEL_HOOK);
                if (!hook) { try { console.warn('[EntityPalette] missing GET_COORDINATES_FROM_PIXEL_HOOK'); } catch (_) {} return; }
                // Support both hook(pixel) and hook(pixel, mapEl)
                let res;
                try { res = (hook.length >= 2) ? hook(pixel, mapEl) : hook(pixel); } catch (err) { try { console.warn('[EntityPalette] hook threw', err); } catch (_) {} return; }
                let lng, lat;
                if (Array.isArray(res)) { [lng, lat] = res; }
                else if (res && typeof res === 'object') { lng = res.lng ?? res.lon ?? res.x; lat = res.lat ?? res.y; }
                if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) { try { console.warn('[EntityPalette] invalid coords from pixel', { pixel, res }); } catch (_) {} return; }
                const item = JSON.parse(raw);
                try { console.log('[EntityPalette] drop -> dispatch', { pixel, lng, lat, mapElTag: mapEl.tagName, mapElClass: mapEl.className, label: item?.label }); } catch (_) {}
                dispatch(placeAtCoords({ lng, lat, item }));
                setIsDndActive(false);
            } catch (err) { try { console.warn('[EntityPalette] drop handler error', err); } catch (_) {} }
        };
        window.addEventListener('dragover', onDragOver, true);
        window.addEventListener('drop', onDrop, true);
        return () => {
            window.removeEventListener('dragover', onDragOver, true);
            window.removeEventListener('drop', onDrop, true);
        };
    }, [isDndActive, dispatch]);

    // Mouse-based fallback: start on mousedown over palette item, place on mouseup over map
    const handleMouseDownStart = (item, groupId) => (e) => {
        try { e.stopPropagation(); } catch (_) {}
        try { e.preventDefault(); } catch (_) {}
        dragPayloadRef.current = { item, groupId };
        mouseStartRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
        setIsMouseDragActive(true);
    };
    useEffect(() => {
        if (!isMouseDragActive) return;
        const onMouseUp = (e) => {
            const payload = dragPayloadRef.current;
            setIsMouseDragActive(false);
            if (!payload) return;
            // Only treat as drag if moved enough pixels
            const dx = (e.clientX - (mouseStartRef.current?.x || 0));
            const dy = (e.clientY - (mouseStartRef.current?.y || 0));
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 6) { dragPayloadRef.current = null; return; }
            // compute coords only if the cursor is over a map element
            const startEl = document.elementFromPoint(e.clientX, e.clientY);
            const selectors = [
                '.mapstore-map .leaflet-container', '.leaflet-container',
                '.mapstore-map .leaflet-map-pane', '.leaflet-map-pane',
                '.mapstore-map .mapboxgl-canvas', '.mapboxgl-canvas',
                '.mapstore-map .mapboxgl-canvas-container', '.mapboxgl-canvas-container',
                '.mapstore-map .ol-viewport', '.ol-viewport',
                '.mapstore-map canvas', 'canvas',
                '.mapstore-map', '#map'
            ];
            let mapEl = null;
            if (startEl && startEl.closest) {
                for (const sel of selectors) { mapEl = startEl.closest(sel); if (mapEl) break; }
            }
            if (!mapEl) { try { console.warn('[EntityPalette] fallback: no map element found under cursor', startEl?.tagName, startEl?.className); } catch (_) {} dragPayloadRef.current = null; return; }
            const rect = mapEl.getBoundingClientRect();
            const pixel = [e.clientX - rect.left, e.clientY - rect.top];
            const hook = getHook(GET_COORDINATES_FROM_PIXEL_HOOK);
            if (!hook) { try { console.warn('[EntityPalette] fallback: missing GET_COORDINATES_FROM_PIXEL_HOOK'); } catch (_) {} return; }
            let res;
            try { res = hook.length >= 2 ? hook(pixel, mapEl) : hook(pixel); } catch (err) { try { console.warn('[EntityPalette] fallback hook threw', err); } catch (_) {} return; }
            let lng, lat;
            if (Array.isArray(res)) { [lng, lat] = res; }
            else if (res && typeof res === 'object') { lng = res.lng ?? res.lon ?? res.x; lat = res.lat ?? res.y; }
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) return;
            try { console.log('[EntityPalette] fallback -> dispatch', { pixel, lng, lat, mapElTag: mapEl.tagName, mapElClass: mapEl.className, label: payload.item?.label }); } catch (_) {}
            dispatch(placeAtCoords({ lng, lat, item: payload.item }));
            dragPayloadRef.current = null;
        };
        window.addEventListener('mouseup', onMouseUp, true);
        return () => window.removeEventListener('mouseup', onMouseUp, true);
    }, [isMouseDragActive, dispatch]);

    if (!open) {
        return (
            <div style={reopenButtonStyle}>
                <div title="إظهار"
                    style={reopenBtnStyle}
                    onClick={() => dispatch(toggleEntityPalette())}
                >
                    <Glyphicon glyph="th-large" />
                </div>
            </div>
        );
    }

    const onSelect = (groupId, item) => {
        dispatch(setArmedItem({ ...item, groupId }));
    };

    const onDelete = (id) => {
        dispatch(setSelectedId(id));
        dispatch({ type: 'entitypalette/DELETE_FEATURE', id });
    };

    const onMove = (id) => {
        // enter move mode and highlight the target
        dispatch(setSelectedId(id));
        // ensure we are not in place mode to avoid conflicts with move
        dispatch(setArmedItem(null));
        // ensure no DnD overlay/mouse fallback is active to allow map clicks
        try { setIsDndActive(false); } catch (_) {}
        try { setIsMouseDragActive(false); } catch (_) {}
        try { dragPayloadRef.current = null; } catch (_) {}
        try { console.log('[EntityPalette] move: armed OFF, overlays cleared, waiting for map click to move id', id); } catch (_) {}
        dispatch(setMoveTarget(id));
    };

    const onSizeChange = (id, delta) => {
        dispatch(updateIconStyle({ id, sizeDelta: delta, rotateDelta: 0 }));
    };
    const onRotateChange = (id, deltaDeg) => {
        dispatch(updateIconStyle({ id, sizeDelta: 0, rotateDelta: deltaDeg }));
    };

    // Keep edit form in sync with the currently selected feature
    useEffect(() => {
        if (selectedFeature) {
            setMetaDraft({
                name: selectedFeature?.properties?.name || '',
                code: selectedFeature?.properties?.code || '',
                faction: selectedFeature?.properties?.faction || '',
                notes: selectedFeature?.properties?.notes || ''
            });
        }
    }, [selectedFeature?.id]);

    return (
        <div className="ms-entity-palette" style={paletteContainerStyle}>
            {/* Global DnD overlay to reliably capture drop over the map */}
            {isDndActive && (
                <div
                    className="entity-dnd-overlay"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const raw = e.dataTransfer?.getData('application/x-entity') || e.dataTransfer?.getData('text/plain');
                        if (!raw) return;
                        // Locate map element under the cursor for coordinate transform
                        const startEl = document.elementFromPoint(e.clientX, e.clientY);
                        const selectors = [
                            '.mapstore-map .leaflet-container', '.leaflet-container',
                            '.mapstore-map .leaflet-map-pane', '.leaflet-map-pane',
                            '.mapstore-map .mapboxgl-canvas', '.mapboxgl-canvas',
                            '.mapstore-map .mapboxgl-canvas-container', '.mapboxgl-canvas-container',
                            '.mapstore-map .ol-viewport', '.ol-viewport',
                            '.mapstore-map canvas', 'canvas',
                            '.mapstore-map', '#map'
                        ];
                        let mapEl = null;
                        if (startEl && startEl.closest) {
                            for (const sel of selectors) { mapEl = startEl.closest(sel); if (mapEl) break; }
                        }
                        if (!mapEl) {
                            for (const sel of selectors) { mapEl = document.querySelector(sel); if (mapEl) break; }
                        }
                        if (!mapEl) return;
                        const rect = mapEl.getBoundingClientRect();
                        const pixel = [e.clientX - rect.left, e.clientY - rect.top];
                        const hook = getHook(GET_COORDINATES_FROM_PIXEL_HOOK);
                        if (!hook) return;
                        const res = (hook.length >= 2) ? hook(pixel, mapEl) : hook(pixel);
                        let lng, lat;
                        if (Array.isArray(res)) { [lng, lat] = res; }
                        else if (res && typeof res === 'object') { lng = res.lng ?? res.lon ?? res.x; lat = res.lat ?? res.y; }
                        if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) return;
                        try { const item = JSON.parse(raw); dispatch(placeAtCoords({ lng, lat, item })); } catch (_) { /* noop */ }
                        // close overlay after successful drop
                        try { setIsDndActive(false); } catch (_) {}
                    }}
                    style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'auto', background: 'transparent' }}
                />
            )}
            <div style={{ ...headerStyle, borderBottom: 'none', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>لوحة الاقسام</span>
                    <span title="إخفاء" onClick={() => dispatch(toggleEntityPalette())}>
                        <Glyphicon glyph="remove" />
                    </span>
                </div>
            </div>
            {groups.map(g => (
                <div key={g.id} style={{ marginBottom: 6 }}>
                    <div style={headerStyle}>{g.label}</div>
                    <div style={gridStyle}>
                        {g.items.map(item => (
                            <div key={item.id}
                                title={item.label}
                                style={{ ...itemStyle, outline: armedItem && armedItem.id === item.id ? '2px solid #09f' : 'none' }}
                                onClick={() => onSelect(g.id, item)}
                                draggable
                                onDragStart={handleDragStart(item, g.id)}
                                onMouseDown={handleMouseDownStart(item, g.id)}
                                data-entity-payload={JSON.stringify({ ...item, groupId: g.id })}
                                data-entity-label={item.label}
                                data-entity-icon={item.icon}
                            >
                                <img
                                    src={item.icon}
                                    alt={item.label}
                                    style={{ maxWidth: 44, maxHeight: 44, cursor: 'grab', userSelect: 'none', WebkitUserDrag: 'element' }}
                                    draggable
                                    onDragStart={handleDragStart(item, g.id)}
                                    onMouseDown={handleMouseDownStart(item, g.id)}
                                    data-entity-payload={JSON.stringify({ ...item, groupId: g.id })}
                                    data-entity-label={item.label}
                                    data-entity-icon={item.icon}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
            {armedItem ? (
                <div style={{ padding: '6px 8px', fontSize: 12, borderTop: '1px solid #eee' }}>
                    تم اختيار: <strong>{armedItem.label}</strong> — انقر على الخريطة لوضعه.
                </div>
            ) : null}
            <div style={{ padding: '6px 8px', fontSize: 12, borderTop: '1px solid #eee' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>الرموز الموضوعة</div>
                {entityFeatures.length === 0 ? (
                    <div style={{ color: '#777' }}>لا توجد رموز بعد.</div>
                ) : entityFeatures.map(f => (
                    <div key={f.id}
                        onClick={() => dispatch(setSelectedId(f.id))}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, padding: '4px 6px', borderRadius: 4, background: selectedId === f.id ? 'rgba(0,186,255,0.12)' : 'transparent', border: selectedId === f.id ? '1px solid #00baff' : '1px solid transparent', cursor: 'pointer' }}>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: selectedId === f.id ? 700 : 400, color: selectedId === f.id ? '#00baff' : 'inherit' }}>{f.id}</span>
                        <div className="btn-group" role="group" aria-label="scale">
                            <button className="btn btn-xs btn-default" title="تصغير" onClick={(e) => { e.stopPropagation(); onSizeChange(f.id, -6); }}>−</button>
                            <button className="btn btn-xs btn-default" title="تكبير" onClick={(e) => { e.stopPropagation(); onSizeChange(f.id, +6); }}>＋</button>
                        </div>
                        <div className="btn-group" role="group" aria-label="rotate">
                            <button className="btn btn-xs btn-default" title="دوران يسار" onClick={(e) => { e.stopPropagation(); onRotateChange(f.id, -15); }}>
                                <Glyphicon glyph="repeat" style={{ transform: 'scaleX(-1)' }} />
                            </button>
                            <button className="btn btn-xs btn-default" title="دوران يمين" onClick={(e) => { e.stopPropagation(); onRotateChange(f.id, +15); }}>
                                <Glyphicon glyph="repeat" />
                            </button>
                        </div>
                        <button className="btn btn-xs btn-default" title="تحريك" onClick={(e) => { e.stopPropagation(); onMove(f.id); }}>
                            <Glyphicon glyph="move" />
                        </button>
                        <button className="btn btn-xs btn-danger" title="حذف" onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}>
                            <Glyphicon glyph="trash" />
                        </button>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }} />
                {selectedId ? (
                    <div className="ms-properties-viewer" style={{ marginTop: 8, padding: 8, borderTop: '1px solid #eee' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontWeight: 600, marginBottom: 6 }}>بيانات الرمز</div>
                        {/* Read-only summary */}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 6, columnGap: 8, marginBottom: 8 }}>
                            <label style={{ alignSelf: 'center' }}>الاسم</label>
                            <div>{selectedFeature?.properties?.name || '—'}</div>
                            <label style={{ alignSelf: 'center' }}>رقم الهوية</label>
                            <div>{selectedFeature?.properties?.code || '—'}</div>
                            <label style={{ alignSelf: 'center' }}>التنظيم</label>
                            <div>{selectedFeature?.properties?.faction || '—'}</div>
                            <label style={{ alignSelf: 'start' }}>ملاحظات</label>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{selectedFeature?.properties?.notes || '—'}</div>
                        </div>
                        {/* Toolbar: Edit toggle + saved feedback */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: editOpen ? 6 : 0 }}>
                            <button className="btn btn-xs btn-default" onClick={() => setEditOpen(!editOpen)}>
                                {editOpen ? 'إخفاء النموذج' : 'تعديل'}
                            </button>
                            {savedTs && (Date.now() - savedTs < 2000) ? (
                                <span style={{ color: '#5cb85c', fontSize: 12 }}>تم الحفظ</span>
                            ) : null}
                        </div>
                        {editOpen && (
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 6, columnGap: 8 }}>
                            <label style={{ alignSelf: 'center' }}>الاسم</label>
                            <input className="form-control input-sm" value={metaDraft.name} onChange={e => setMetaDraft({ ...metaDraft, name: e.target.value })} placeholder="الاسم" />
                            <label style={{ alignSelf: 'center' }}>رقم الهوية</label>
                            <div>
                                <input
                                    className="form-control input-sm"
                                    value={metaDraft.code}
                                    onChange={e => setMetaDraft({ ...metaDraft, code: e.target.value })}
                                    placeholder="رقم الهوية"
                                    style={{ borderColor: (metaDraft.code === '' || /^\d*$/.test(metaDraft.code)) ? undefined : '#d9534f' }}
                                />
                                {metaDraft.code !== '' && !/^\d*$/.test(metaDraft.code) && (
                                    <div style={{ color: '#d9534f', fontSize: 11, marginTop: 2 }}>يجب أن يكون رقم الهوية أرقامًا فقط</div>
                                )}
                            </div>
                            <label style={{ alignSelf: 'center' }}>التنظيم</label>
                            <input className="form-control input-sm" value={metaDraft.faction} onChange={e => setMetaDraft({ ...metaDraft, faction: e.target.value })} placeholder="التنظيم" />
                            <label style={{ alignSelf: 'start' }}>ملاحظات</label>
                            <textarea className="form-control input-sm" rows={3} value={metaDraft.notes} onChange={e => setMetaDraft({ ...metaDraft, notes: e.target.value })} placeholder="ملاحظات (اختياري)" />
                        </div>
                        )}
                        {editOpen && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ color: (metaDraft.name !== selectedFeature?.properties?.name ||
                                    metaDraft.code !== selectedFeature?.properties?.code ||
                                    metaDraft.faction !== selectedFeature?.properties?.faction ||
                                    metaDraft.notes !== selectedFeature?.properties?.notes) ? '#f0ad4e' : '#999', fontSize: 12 }}>
                                    {(metaDraft.name !== selectedFeature?.properties?.name ||
                                        metaDraft.code !== selectedFeature?.properties?.code ||
                                        metaDraft.faction !== selectedFeature?.properties?.faction ||
                                        metaDraft.notes !== selectedFeature?.properties?.notes) ? 'تغييرات غير محفوظة' : 'لا توجد تغييرات'}
                                </div>
                                <div>
                                    <button className="btn btn-xs btn-default" onClick={() => { setMetaDraft({ name: selectedFeature?.properties?.name || '', code: selectedFeature?.properties?.code || '', faction: selectedFeature?.properties?.faction || '', notes: selectedFeature?.properties?.notes || '' }); setEditOpen(false); }}>إلغاء</button>
                                    <button
                                        className="btn btn-xs btn-primary"
                                        disabled={(
                                            // disable when no changes
                                            !(metaDraft.name !== selectedFeature?.properties?.name ||
                                              metaDraft.code !== selectedFeature?.properties?.code ||
                                              metaDraft.faction !== selectedFeature?.properties?.faction ||
                                              metaDraft.notes !== selectedFeature?.properties?.notes)
                                        ) || (
                                            // disable when code invalid (must be digits only if present)
                                            !(metaDraft.code === '' || /^\d*$/.test(metaDraft.code))
                                        ) || !selectedId}
                                        title={
                                            !(metaDraft.name !== selectedFeature?.properties?.name ||
                                              metaDraft.code !== selectedFeature?.properties?.code ||
                                              metaDraft.faction !== selectedFeature?.properties?.faction ||
                                              metaDraft.notes !== selectedFeature?.properties?.notes)
                                              ? 'لا توجد تغييرات'
                                              : (!(metaDraft.code === '' || /^\d*$/.test(metaDraft.code)) ? 'رقم الهوية غير صالح' : '')
                                        }
                                        onClick={() => {
                                            const now = Date.now();
                                            if (now - lastSaveTsRef.current < 600) return; // debounce rapid clicks
                                            lastSaveTsRef.current = now;
                                            const payload = {
                                                id: selectedId,
                                                name: (metaDraft.name || '').trim(),
                                                // enforce digits-only in payload as well
                                                code: (metaDraft.code || '').trim(),
                                                faction: (metaDraft.faction || '').trim(),
                                                notes: (metaDraft.notes || '').trim()
                                            };
                                            // Guard: do not dispatch if code invalid
                                            if (!(payload.code === '' || /^\d*$/.test(payload.code))) return;
                                            dispatch(updateFeatureMetadata(payload));
                                            setSavedTs(Date.now());
                                            setEditOpen(false);
                                        }}
                                    >حفظ</button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

EntityPalette.propTypes = {
    open: PropTypes.bool,
    armedItem: PropTypes.object,
    entityFeatures: PropTypes.array,
    selectedId: PropTypes.string,
    dispatch: PropTypes.func
};

const Connected = connect(state => ({
    open: state?.entitypalette?.open,
    armedItem: state?.entitypalette?.armedItem,
    entityFeatures: ((state.layers && (state.layers.flat || state.layers.layers)) || [])
        .find(l => l.id === 'entitypalette')?.features || [],
    selectedId: state?.entitypalette?.selectedId
}))(EntityPalette);

// Generate a readable default name with incremental index per base label (usually the image label)
const getNextName = (base, features = []) => {
    // Escape regex special characters in base label
    const esc = (base || '').replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
    const regex = new RegExp(`^${esc}\\s*(\\d+)$`, 'i');
    const nums = features
        .map(f => (f.properties && f.properties.name) || '')
        .map(n => {
            const m = n.match(regex);
            return m ? parseInt(m[1], 10) : 0;
        })
        .filter(n => !isNaN(n));
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `${base} ${next}`;
};

// Epic: when an item is armed, place it on map click as a vector point with Icon style
const addEntityOnMapClickEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(CLICK_ON_MAP)
        .filter(() => !!getState()?.entitypalette?.armedItem || !!getState()?.entitypalette?.moveTargetId)
        .mergeMap(({ point }) => {
            const state = getState();
            const { armedItem, moveTargetId } = state.entitypalette;

            // Decide input source based on map CRS: for 3857/900913 use point.coordinate; for 4326 use latlng
            const srcCrs = state?.map?.present?.projection || state?.map?.projection || 'EPSG:4326';
            const isWebMerc = srcCrs === 'EPSG:3857' || srcCrs === 'EPSG:900913';
            const hasCoord = Array.isArray(point?.coordinate) && point.coordinate.length >= 2;
            const hasLatLng = point?.latlng && (point.latlng.lng ?? point.latlng.lon) != null && point.latlng.lat != null;
            let inX = null, inY = null, sourceUsed = null;
            if (isWebMerc && hasCoord) {
                inX = point.coordinate[0];
                inY = point.coordinate[1];
                sourceUsed = 'coordinate(src=3857)';
            } else if (hasLatLng) {
                inX = point.latlng.lng ?? point.latlng.lon;
                inY = point.latlng.lat;
                sourceUsed = 'latlng(src=4326)';
            } else {
                // final fallback for odd payloads
                inX = point?.lon ?? point?.x ?? (hasCoord ? point.coordinate[0] : null);
                inY = point?.lat ?? point?.y ?? (hasCoord ? point.coordinate[1] : null);
                sourceUsed = 'fallback';
            }
            if (inX == null || inY == null || isNaN(inX) || isNaN(inY)) {
                return Rx.Observable.empty();
            }
            // Infer layer CRS from existing feature coordinates when featuresCrs is missing
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            const firstCoords = existing?.features && existing.features[0]?.geometry?.coordinates;
            const inferred = Array.isArray(firstCoords) && isFinite(firstCoords[0]) && isFinite(firstCoords[1]) && Math.abs(firstCoords[0]) <= 180 && Math.abs(firstCoords[1]) <= 90 ? 'EPSG:4326' : 'EPSG:3857';
            const declared = existing?.featuresCrs;
            const layerCrs = declared || inferred; // current stored features CRS
            const targetCrs = 'EPSG:4326'; // lock storage to 4326
            let outLng = inX;
            let outLat = inY;
            try {
                if (srcCrs !== targetCrs) {
                    // Handle EPSG:900913 alias by trying EPSG:3857 as a fallback
                    const from = srcCrs === 'EPSG:900913' ? 'EPSG:3857' : srcCrs;
                    const to = targetCrs === 'EPSG:900913' ? 'EPSG:3857' : targetCrs;
                    const p = reproject([inX, inY], from, to);
                    if (Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) {
                        outLng = p[0];
                        outLat = p[1];
                    }
                }
            } catch (err) { /* leave as-is on failure */ }
            try { console.log('[EntityPalette] CLICK_ON_MAP received', { armed: !!armedItem, moving: !!moveTargetId, srcCrs, declared, inferred, layerCrs, targetCrs, sourceUsed, in: [inX, inY], out: [outLng, outLat] }); } catch (_) {}

            const id = moveTargetId || `entity-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            // If layer CRS differs from 4326, migrate existing features during MOVE
            let currentFeatures = existing?.features || [];
            let migrated = false;
            try {
                if (moveTargetId && existing && layerCrs && layerCrs !== targetCrs) {
                    const from = layerCrs === 'EPSG:900913' ? 'EPSG:3857' : layerCrs;
                    const to = targetCrs === 'EPSG:900913' ? 'EPSG:3857' : targetCrs;
                    currentFeatures = (existing.features || []).map(f => {
                        const c = f?.geometry?.coordinates;
                        if (!Array.isArray(c) || c.length < 2) return f;
                        try {
                            const p = reproject([c[0], c[1]], from, to);
                            if (Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) {
                                return { ...f, geometry: { ...f.geometry, coordinates: [p[0], p[1]] } };
                            }
                        } catch (e) { /* keep original */ }
                        return f;
                    });
                    migrated = true;
                }
            } catch (e) { /* ignore */ }

            // Preserve full properties when moving; otherwise create with default name
            const movingFeature = moveTargetId ? currentFeatures.find(f => f.id === moveTargetId) : null;
            const base = armedItem?.label || null; // use image label as base
            const name = movingFeature?.properties?.name || (base ? getNextName(base, currentFeatures) : id);
            const properties = movingFeature && moveTargetId
                ? { ...movingFeature.properties, eid: (movingFeature.properties && movingFeature.properties.eid) || id }
                : { id, eid: id, image: armedItem && armedItem.icon, name };
            const feature = { type: 'Feature', id, geometry: { type: 'Point', coordinates: [outLng, outLat] }, properties };
            const newRule = { name: '', filter: ['==', 'eid', id], symbolizers: [
                // Fallback marker (under icon)
                { kind: 'Mark', wellKnownName: 'Circle', color: '#e74c3c', fillOpacity: 1, strokeColor: '#ffffff', strokeOpacity: 1, strokeWidth: 2, radius: 6 },
                // Main icon
                { kind: 'Icon', image: (armedItem && armedItem.icon) || feature.properties?.image, size: 48, rotate: 0, opacity: 1 }
            ] };

            if (!existing) {
                return Rx.Observable.from([
                    addLayer({ id: 'entitypalette', type: 'vector', name: 'Entity Palette', visibility: true, features: [feature], featuresCrs: 'EPSG:4326', style: { format: 'geostyler', body: { name: '', rules: [newRule] } } }),
                    setSelectedId(moveTargetId ? null : id)
                ]);
            }

            const baseFeatures = currentFeatures;
            const otherFeatures = baseFeatures.filter(f => f.id !== id);
            // Ensure a style rule exists for the id (esp. when moving)
            const prevRules = existing?.style?.body?.rules || [];
            const hasRule = prevRules.some(r => Array.isArray(r.filter) && r.filter[0] === '==' && r.filter[1] === 'eid' && r.filter[2] === id);
            const nextRules = moveTargetId ? (hasRule ? prevRules : [...prevRules, newRule]) : [...prevRules, newRule];
            const updated = { ...existing, features: [ ...otherFeatures, feature ], featuresCrs: 'EPSG:4326', style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules: nextRules } } };
            try { console.log('[EntityPalette] applying', moveTargetId ? 'MOVE' : 'PLACE', { id, out: [outLng, outLat], migrated, from: layerCrs, to: targetCrs, hadRule: hasRule, rulesCount: nextRules.length }); } catch (_) {}
            return Rx.Observable.from([
                updateNode(existing.id, 'layers', updated),
                // keep selection after move to preserve the halo on the moved icon
                setSelectedId(id),
                setArmedItem(null),
                setMoveTarget(null)
            ]);
        });

// Epic: place from drag-and-drop with explicit coords
const placeAtCoordsEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(PLACE_AT_COORDS)
        .mergeMap(({ lng, lat, item }) => {
            if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) {
                return Rx.Observable.empty();
            }
            const state = getState();
            const srcCrs = state?.map?.present?.projection || state?.map?.projection || 'EPSG:4326';
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            const targetCrs = 'EPSG:4326';
            let outLng = lng;
            let outLat = lat;
            try {
                if (srcCrs !== targetCrs) {
                    const from = srcCrs === 'EPSG:900913' ? 'EPSG:3857' : srcCrs;
                    const to = targetCrs === 'EPSG:900913' ? 'EPSG:3857' : targetCrs;
                    const p = reproject([lng, lat], from, to);
                    if (Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1])) {
                        outLng = p[0];
                        outLat = p[1];
                    }
                }
            } catch (err) { /* ignore reprojection errors */ }
            try { console.log('[EntityPalette] placeAtCoordsEpic', { srcCrs, targetCrs, in: [lng, lat], out: [outLng, outLat], inX: lng, inY: lat, outX: outLng, outY: outLat }); } catch (_) {}
            const id = `entity-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            const feature = {
                type: 'Feature', id,
                geometry: { type: 'Point', coordinates: [outLng, outLat] },
                properties: { id, eid: id, image: item?.icon, name: item?.label ? getNextName(item.label, existing?.features || []) : id }
            };
            const newRule = { name: '', filter: ['==', 'eid', id], symbolizers: [
                { kind: 'Mark', wellKnownName: 'Circle', color: '#e74c3c', fillOpacity: 1, strokeColor: '#ffffff', strokeOpacity: 1, strokeWidth: 2, radius: 6 },
                { kind: 'Icon', image: item?.icon, size: 48, rotate: 0, opacity: 1 }
            ] };
            if (!existing) {
                // First-time DROP: create the layer under the default group to ensure visibility
                return Rx.Observable.of(
                    addLayer({
                        id: 'entitypalette',
                        type: 'vector',
                        name: 'Entity Palette',
                        group: 'Default',
                        visibility: true,
                        features: [feature],
                        featuresCrs: 'EPSG:4326',
                        style: { format: 'geostyler', body: { name: '', rules: [newRule] } }
                    })
                );
            }
            const rules = existing?.style?.body?.rules || [];
            const updated = { ...existing, features: [ ...(existing.features || []), feature ], featuresCrs: 'EPSG:4326', style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules: [...rules, newRule] } } };
            return Rx.Observable.from([
                updateNode(existing.id, 'layers', updated),
                setSelectedId(id)
            ]);
        });

// Epic: delete feature by id
const deleteFeatureEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType('entitypalette/DELETE_FEATURE')
        .mergeMap(({ id }) => {
            const state = getState();
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            if (!existing) return Rx.Observable.of({ type: 'IGNORE' });
            const features = (existing.features || []).filter(f => f.id !== id);
            const rules = (existing?.style?.body?.rules || []).filter(r => !(Array.isArray(r.filter) && r.filter[0] === '==' && r.filter[1] === 'eid' && r.filter[2] === id));
            const updated = { ...existing, features, featuresCrs: existing.featuresCrs, style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules } } };
            const selectedIdNow = state?.entitypalette?.selectedId;
            const actions = [ updateNode(existing.id, 'layers', updated) ];
            if (selectedIdNow === id || features.length === 0) {
                actions.push(setSelectedId(null));
            }
            return Rx.Observable.from(actions);
        });

// Epic: select entity on map click (nearest by geo distance) to show metadata
const selectEntityOnMapClickEpic = (action$, { getState = () => {} }) => action$
    .ofType(CLICK_ON_MAP)
    .filter(() => {
        const s = getState()?.entitypalette;
        return !s?.armedItem && !s?.moveTargetId; // only when not placing or moving
    })
    .map(({ point }) => {
        const state = getState();
        const layers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
        const existing = layers.find(l => l.id === 'entitypalette');
        if (!existing || !(existing.features || []).length) return { type: 'IGNORE' };
        const lng = point?.latlng?.lng ?? point?.latlng?.lon ?? point?.lon ?? point?.x ?? (point?.coordinate && point.coordinate[0]);
        const lat = point?.latlng?.lat ?? point?.lat ?? point?.y ?? (point?.coordinate && point.coordinate[1]);
        if (typeof lng !== 'number' || typeof lat !== 'number') return { type: 'IGNORE' };
        const dist = (a, b) => {
            const dx = (a[0] - b[0]);
            const dy = (a[1] - b[1]);
            return Math.sqrt(dx*dx + dy*dy);
        };
        const target = (existing.features || [])
            .map(f => ({ f, d: dist([lng, lat], f?.geometry?.coordinates || [Infinity, Infinity]) }))
            .sort((a, b) => a.d - b.d)[0];
        const threshold = 0.0005; // ~50m in degrees; adjust if needed
        if (!target || !target.f || target.d > threshold) return { type: 'IGNORE' };
        return setSelectedId(target.f.id);
    });

// Epic: update icon style (size/rotation) for a specific feature id
const updateIconStyleEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(UPDATE_ICON_STYLE)
        .mergeMap(({ id, sizeDelta = 0, rotateDelta = 0 }) => {
            const state = getState();
            const layers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = layers.find(l => l.id === 'entitypalette');
            if (!existing) return Rx.Observable.empty();
            const rules = (existing?.style?.body?.rules || []).slice();
            let rule = rules.find(r => Array.isArray(r.filter) && r.filter[0] === '==' && r.filter[1] === 'eid' && r.filter[2] === id);
            if (!rule) {
                const feat = (existing.features || []).find(f => f.id === id);
                const image = feat?.properties?.image || '';
                rule = { name: '', filter: ['==', 'eid', id], symbolizers: [
                    // Fallback marker (under icon)
                    { kind: 'Mark', wellKnownName: 'Circle', color: '#e74c3c', fillOpacity: 1, strokeColor: '#ffffff', strokeOpacity: 1, strokeWidth: 2, radius: 6 },
                    // Main icon
                    { kind: 'Icon', image, size: 48, rotate: 0, opacity: 1 }
                ] };
                rules.push(rule);
            }
            // Robust: operate on the REAL icon (exclude HALO icon)
            const iconSym = (rule.symbolizers || []).find(s => s.kind === 'Icon' && s.image !== HALO_IMG);
            const otherSyms = (rule.symbolizers || []).filter(s => {
                if (s.kind === 'Icon' && s.image === HALO_IMG) return false; // drop old halo if any
                if (iconSym && s === iconSym) return false; // will rebuild real icon
                return s.kind !== 'Mark'; // we don't use marks
            });
            const image = iconSym?.image || ((existing.features || []).find(f => f.id === id)?.properties?.image) || '';
            const prevSize = (iconSym && typeof iconSym.size === 'number') ? iconSym.size : 48;
            const newSize = Math.max(12, Math.min(160, prevSize + sizeDelta));
            const prevRotate = (iconSym && typeof iconSym.rotate === 'number') ? iconSym.rotate : 0;
            const newRotate = ((prevRotate + rotateDelta) % 360 + 360) % 360;
            const newIcon = { kind: 'Icon', image, size: newSize, rotate: newRotate, opacity: (iconSym && typeof iconSym.opacity === 'number') ? iconSym.opacity : 1 };
            // keep halo if selected
            const wantHalo = state?.entitypalette?.selectedId === id;
            const haloSize = Math.max(12, Math.min(200, (newIcon.size || 48) + 12));
            const haloIcon = wantHalo ? [{ kind: 'Icon', image: HALO_IMG, size: haloSize, rotate: 0, opacity: 1 }] : [];
            const newSyms = [...haloIcon, newIcon, ...otherSyms];
            const newRules = rules.map(r => r === rule ? { ...r, symbolizers: newSyms } : r);
            const updated = { ...existing, style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules: newRules } } };
            return Rx.Observable.of(updateNode(existing.id, 'layers', updated));
        });

// Epic: update feature metadata (properties)
const updateFeatureMetadataEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(UPDATE_FEATURE_METADATA)
        .mergeMap(({ id, name, code, faction, notes }) => {
            const state = getState();
            const layers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = layers.find(l => l.id === 'entitypalette');
            if (!existing) return Rx.Observable.empty();
            // Validate and sanitize metadata
            const clean = {
                name: (name || '').trim(),
                code: (code || '').trim(),
                faction: (faction || '').trim(),
                notes: (notes || '').trim()
            };
            // Enforce numeric-only for code
            if (!(clean.code === '' || /^\d*$/.test(clean.code))) {
                return Rx.Observable.empty();
            }
            const features = (existing.features || []).map(f => f.id === id ? { ...f, properties: { ...(f.properties || {}), name, code, faction, notes } } : f);
            const updated = { ...existing, features };
            return Rx.Observable.of(updateNode(existing.id, 'layers', updated));
        });

// Epic: add/remove halo for selected entity by adjusting style
const haloForSelectionEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(SET_SELECTED_ID)
        .mergeMap(({ id }) => {
            const state = getState();
            const layers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = layers.find(l => l.id === 'entitypalette');
            if (!existing) return Rx.Observable.empty();
            const rules = (existing?.style?.body?.rules || []).map(r => {
                if (!(Array.isArray(r.filter) && r.filter[0] === '==' && r.filter[1] === 'eid')) return r;
                const isSelected = r.filter[2] === id && id;
                const realIcon = (r.symbolizers || []).find(s => s.kind === 'Icon' && s.image !== HALO_IMG);
                const rest = (r.symbolizers || []).filter(s => {
                    if (s.kind === 'Icon' && s.image === HALO_IMG) return false; // remove previous halo
                    if (realIcon && s === realIcon) return false; // will re-add
                    return s.kind !== 'Mark';
                });
                const haloSize = Math.max(12, Math.min(200, (realIcon?.size || 48) + 12));
                const haloIcon = isSelected ? [{ kind: 'Icon', image: HALO_IMG, size: haloSize, rotate: 0, opacity: 1 }] : [];
                const rebuilt = [...haloIcon, ...(realIcon ? [realIcon] : []), ...rest];
                return { ...r, symbolizers: rebuilt };
            });
            const updated = { ...existing, style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules } } };
            return Rx.Observable.of(updateNode(existing.id, 'layers', updated));
        });

const epicsDef = { addEntityOnMapClickEpic, placeAtCoordsEpic, deleteFeatureEpic, selectEntityOnMapClickEpic, updateIconStyleEpic, updateFeatureMetadataEpic, haloForSelectionEpic };

// Plugin export (MapStore expects a plugin definition object)
export default {
    EntityPalettePlugin: Object.assign(Connected, {
        Map: {
            name: 'EntityPalette',
            Tool: Connected,
            priority: 1
        }
    }),
    reducers: { entitypalette: entityPaletteReducer },
    epics: epicsDef
};

// Redux export for MapStore to combine
export const reducers = { entitypalette: entityPaletteReducer };

// Placeholder epics (to be implemented next)
export const epics = epicsDef;
