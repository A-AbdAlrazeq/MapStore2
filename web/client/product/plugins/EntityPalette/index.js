import React, { useEffect } from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import { Glyphicon } from 'react-bootstrap';
import Rx from 'rxjs';
import { CLICK_ON_MAP } from '../../../actions/map';
import { addLayer, updateNode } from '../../../actions/layers';
import { getHook, GET_COORDINATES_FROM_PIXEL_HOOK } from '../../../utils/MapUtils';

// Actions (scoped to this plugin)
const TOGGLE_ENTITY_PALETTE = 'entitypalette/TOGGLE';
const SET_ARMED_ITEM = 'entitypalette/SET_ARMED_ITEM';
const SET_MOVE_TARGET = 'entitypalette/SET_MOVE_TARGET';
const PLACE_AT_COORDS = 'entitypalette/PLACE_AT_COORDS';
const SET_SELECTED_ID = 'entitypalette/SET_SELECTED_ID';

export const toggleEntityPalette = () => ({ type: TOGGLE_ENTITY_PALETTE });
export const setArmedItem = (item) => ({ type: SET_ARMED_ITEM, item });
export const setMoveTarget = (id) => ({ type: SET_MOVE_TARGET, id });
export const placeAtCoords = ({ lng, lat, item }) => ({ type: PLACE_AT_COORDS, lng, lat, item });
export const setSelectedId = (id) => ({ type: SET_SELECTED_ID, id });

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
    // Drag & Drop: attach listeners on mount
    useEffect(() => {
        const mapEl = document.querySelector('.mapstore-map');
        if (!mapEl) return;
        const onDragOver = (e) => {
            if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('application/x-entity')) {
                e.preventDefault();
            }
        };
        const onDrop = (e) => {
            const raw = e.dataTransfer && e.dataTransfer.getData('application/x-entity');
            if (!raw) return;
            e.preventDefault();
            // compute pixel relative to container
            const rect = mapEl.getBoundingClientRect();
            const pixel = [e.clientX - rect.left, e.clientY - rect.top];
            const hook = getHook(GET_COORDINATES_FROM_PIXEL_HOOK);
            if (!hook) return;
            const [lng, lat] = hook(pixel) || [];
            try {
                const item = JSON.parse(raw);
                dispatch(placeAtCoords({ lng, lat, item }));
            } catch (err) { /* ignore parse errors */ }
        };
        mapEl.addEventListener('dragover', onDragOver);
        mapEl.addEventListener('drop', onDrop);
        return () => {
            mapEl.removeEventListener('dragover', onDragOver);
            mapEl.removeEventListener('drop', onDrop);
        };
    }, [dispatch]);

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
        // toggle selection when re-clicking Move on the same item
        if (selectedId === id) {
            dispatch(setSelectedId(null)); // clears halo
        } else {
            dispatch(setSelectedId(id));
        }
        dispatch(setMoveTarget(id));
    };

    return (
        <div className="ms-entity-palette" style={paletteContainerStyle}>
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
                                onDragStart={(e) => {
                                    // stash data for drop placement (to be handled by epics later)
                                    e.dataTransfer.setData('application/x-entity', JSON.stringify({ ...item, groupId: g.id }));
                                }}
                            >
                                <img src={item.icon} alt={item.label} style={{ maxWidth: 44, maxHeight: 44 }} />
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
                        <button className="btn btn-xs btn-default" title="تحريك" onClick={(e) => { e.stopPropagation(); onMove(f.id); }}>
                            <Glyphicon glyph="move" />
                        </button>
                        <button className="btn btn-xs btn-danger" title="حذف" onClick={(e) => { e.stopPropagation(); onDelete(f.id); }}>
                            <Glyphicon glyph="trash" />
                        </button>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button className="btn btn-xs btn-default" onClick={() => exportGeoJSON(entityFeatures)}>تصدير</button>
                    <label className="btn btn-xs btn-default" style={{ margin: 0 }}>
                        استيراد
                        <input type="file" accept=".json,.geojson" style={{ display: 'none' }} onChange={(e) => importGeoJSON(e, dispatch)} />
                    </label>
                </div>
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

// Helpers
const exportGeoJSON = (features) => {
    const fc = { type: 'FeatureCollection', features };
    const blob = new Blob([JSON.stringify(fc)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'entities.geojson';
    a.click();
    URL.revokeObjectURL(url);
};

const importGeoJSON = (e, dispatch) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const geojson = JSON.parse(reader.result);
            const features = geojson.type === 'FeatureCollection' ? geojson.features : [];
            dispatch({ type: 'entitypalette/IMPORT_FEATURES', features });
        } catch (err) { /* ignore */ }
    };
    reader.readAsText(file);
};

// Generate a readable default name with incremental index per base label (usually the image label)
const getNextName = (base, features = []) => {
    const regex = new RegExp(`^${base}\\s*(\\d+)$`);
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

            // Extract lng/lat robustly
            const lng = point?.latlng?.lng ?? point?.latlng?.lon ?? point?.lon ?? point?.x ?? (point?.coordinate && point.coordinate[0]);
            const lat = point?.latlng?.lat ?? point?.lat ?? point?.y ?? (point?.coordinate && point.coordinate[1]);
            const id = moveTargetId || `entity-${Date.now()}`;
            const feature = {
                type: 'Feature',
                id,
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { id, image: armedItem && armedItem.icon }
            };

            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');

            const currentFeatures = existing?.features || [];
            // preserve name when moving, otherwise generate new based on group
            const movingFeature = moveTargetId ? currentFeatures.find(f => f.id === moveTargetId) : null;
            const base = armedItem?.label || null; // use image label as base
            const name = movingFeature?.properties?.name || (base ? getNextName(base, currentFeatures) : id);
            const newRule = { name: '', filter: ['==', 'id', id], symbolizers: [{ kind: 'Icon', image: (armedItem && armedItem.icon) || feature.properties?.image, size: 44, opacity: 1 }] };

            if (!existing) {
                return Rx.Observable.from([
                    addLayer({ id: 'entitypalette', type: 'vector', name: 'Entity Palette', visibility: true, features: [feature], style: { format: 'geostyler', body: { name: '', rules: [newRule] } } }),
                    setArmedItem(null),
                    setMoveTarget(null)
                ]);
            }

            // if moving, replace feature with same id; else append
            const otherFeatures = (existing.features || []).filter(f => f.id !== id);
            const updated = { ...existing, features: [ ...otherFeatures, feature ], style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules: moveTargetId ? existing?.style?.body?.rules : [...existing?.style?.body?.rules, newRule] } } };
            return Rx.Observable.from([
                updateNode(existing.id, 'layers', updated),
                // re-dispatch selection to refresh highlight to the new geometry
                setSelectedId(id),
                setArmedItem(null),
                setMoveTarget(null)
            ]);
        });

// Epic: place from drag-and-drop with explicit coords
const placeAtCoordsEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType(PLACE_AT_COORDS)
        .map(({ lng, lat, item }) => {
            const state = getState();
            const id = `entity-${Date.now()}`;
            const feature = {
                type: 'Feature', id,
                geometry: { type: 'Point', coordinates: [lng, lat] },
                properties: { id, image: item?.icon }
            };
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            const currentFeatures = existing?.features || [];
            const base = item?.label || null; // use image label as base
            const name = base ? getNextName(base, currentFeatures) : id;
            const newRule = { name: '', filter: ['==', 'id', id], symbolizers: [{ kind: 'Icon', image: item?.icon, size: 44, opacity: 1 }] };
            if (!existing) {
                return addLayer({ id: 'entitypalette', type: 'vector', name: 'Entity Palette', visibility: true, features: [feature], style: { format: 'geostyler', body: { name: '', rules: [newRule] } } });
            }
            const rules = existing?.style?.body?.rules || [];
            const updated = { ...existing, features: [ ...(existing.features || []), feature ], style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules: [...rules, newRule] } } };
            return updateNode(existing.id, 'layers', updated);
        });

// Epic: delete feature by id
const deleteFeatureEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType('entitypalette/DELETE_FEATURE')
        .map(({ id }) => {
            const state = getState();
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            if (!existing) return { type: 'IGNORE' };
            const features = (existing.features || []).filter(f => f.id !== id);
            const rules = (existing?.style?.body?.rules || []).filter(r => !(Array.isArray(r.filter) && r.filter[0] === '==' && r.filter[1] === 'id' && r.filter[2] === id));
            const updated = { ...existing, features, style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules } } };
            return updateNode(existing.id, 'layers', updated);
        });

// Epic: import features replacing/merging layer
const importFeaturesEpic = (action$, { getState = () => {} }) =>
    action$
        .ofType('entitypalette/IMPORT_FEATURES')
        .map(({ features = [] }) => {
            const state = getState();
            const allLayers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
            const existing = allLayers.find(l => l.id === 'entitypalette');
            const rules = (existing?.style?.body?.rules || []).filter(r => r)
                .filter(r => r.filter && r.filter[0] === '==' && r.filter[1] === 'id')
                .filter(r => features.find(f => `entity-${Date.now()}`)); // placeholder filter safeguard
            const updated = { ...existing, features, style: { format: 'geostyler', body: { name: existing?.style?.body?.name || '', rules } } };
            return updateNode(existing.id, 'layers', updated);
        });

// --- Map highlight (separate layer) ---
const HIGHLIGHT_LAYER_ID = 'entitypalette-highlight';
const buildHighlightStyle = (featureId) => ({
    format: 'geostyler',
    body: {
        name: 'Selection Highlight',
        rules: [{
            name: 'selected',
            filter: ['==', 'id', featureId],
            symbolizers: [
                { kind: 'Mark', wellKnownName: 'Circle', color: '#00baff', fillOpacity: 0.15, strokeColor: '#00baff', strokeOpacity: 1, strokeWidth: 3, radius: 28, zIndex: 1000 },
                { kind: 'Mark', wellKnownName: 'Circle', color: '#ffffff', fillOpacity: 0, strokeColor: '#ffffff', strokeOpacity: 1, strokeWidth: 2, radius: 22, zIndex: 1001 }
            ]
        }]
    }
});

const highlightSelectionEpic = (action$, { getState = () => {} }) => action$
    .ofType(SET_SELECTED_ID)
    .map(({ id }) => {
        const state = getState();
        const layers = (state.layers && (state.layers.flat || state.layers.layers)) || [];
        const entityLayer = layers.find(l => l.id === 'entitypalette');
        const highlightLayer = layers.find(l => l.id === HIGHLIGHT_LAYER_ID);
        if (!entityLayer) return { type: 'IGNORE' };
        const selected = (entityLayer.features || []).find(f => f.id === id || f?.properties?.id === id);

        if (!selected) {
            // clear highlight
            if (highlightLayer) {
                const cleared = { ...highlightLayer, features: [] };
                return updateNode(highlightLayer.id, 'layers', cleared);
            }
            return { type: 'IGNORE' };
        }

        // mirror geometry with a dedicated id for style filtering
        const hId = `sel-${selected.id || id}`;
        const hFeature = { type: 'Feature', id: hId, geometry: selected.geometry, properties: { id: hId } };
        const style = buildHighlightStyle(hId);

        if (!highlightLayer) {
            return addLayer({ id: HIGHLIGHT_LAYER_ID, type: 'vector', name: 'Selection', visibility: true, features: [hFeature], style });
        }
        const updated = { ...highlightLayer, features: [hFeature], style };
        return updateNode(highlightLayer.id, 'layers', updated);
    });

const epicsDef = { addEntityOnMapClickEpic, placeAtCoordsEpic, deleteFeatureEpic, importFeaturesEpic, highlightSelectionEpic };

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
