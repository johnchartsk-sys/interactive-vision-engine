import type { EdgeFeature, EdgeProps, LonLat, NetworkCollection, NodeFeature, NodeProps } from './types';

type NodeExtra = Partial<Omit<NodeProps, 'kind' | 'id' | 'name' | 'nodeType' | 'elevationM'>>;

const node = (id: string, name: string, nodeType: NodeProps['nodeType'], at: LonLat, elevationM: number, extra: NodeExtra = {}): NodeFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: at },
  properties: { kind: 'node', id, name, nodeType, elevationM, ...extra },
});

const edge = (
  id: string, name: string, edgeType: EdgeProps['edgeType'], from: string, to: string,
  diameterMm: number, material: EdgeProps['material'], capacityGPM: number, condition: number, coordinates: LonLat[],
  normallyClosed = false,
): EdgeFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates },
  properties: { kind: 'edge', id, name, edgeType, from, to, diameterMm, material, capacityGPM, condition, ...(normallyClosed ? { normallyClosed: true } : {}) },
});

// Illustrative positions around Windhoek. NOT real utility assets.
const TP1: LonLat = [17.018, -22.512];
const PS1: LonLat = [17.033, -22.526];
const R1: LonLat = [17.056, -22.538];
const PS2: LonLat = [17.082, -22.547];
const R2: LonLat = [17.11, -22.556];
const D1: LonLat = [17.045, -22.56];
const D5: LonLat = [17.03, -22.576];
const D2: LonLat = [17.07, -22.57];
const D6: LonLat = [17.086, -22.59];
const D3: LonLat = [17.105, -22.578];
const D4: LonLat = [17.125, -22.57];

export const NETWORK: NetworkCollection = {
  type: 'FeatureCollection',
  name: 'NamTwin Water - illustrative simulated network (not real utility asset data)',
  features: [
    node('TP-1', 'Treatment Plant TP-1', 'TreatmentPlant', TP1, 1612, { capacityGPM: 2200 }),
    node('PS-1', 'Pump Station PS-1', 'PumpStation', PS1, 1618, { capacityGPM: 1800, pumpHeadM: 55 }),
    node('R-1', 'Reservoir R-1', 'Reservoir', R1, 1655, { capacityGal: 700000, initialPct: 78, tankDepthM: 8 }),
    node('PS-2', 'Pump Station PS-2', 'PumpStation', PS2, 1640, { capacityGPM: 600, pumpHeadM: 60 }),
    node('R-2', 'Reservoir R-2', 'Reservoir', R2, 1685, { capacityGal: 300000, initialPct: 70, tankDepthM: 7 }),
    node('D-1', 'Zone D-1 (Residential)', 'DemandPoint', D1, 1622, { baseDemandGPM: 160, zone: 'Residential' }),
    node('D-5', 'Zone D-5 (Residential)', 'DemandPoint', D5, 1610, { baseDemandGPM: 120, zone: 'Residential' }),
    node('D-2', 'Zone D-2 (Residential)', 'DemandPoint', D2, 1618, { baseDemandGPM: 220, zone: 'Residential' }),
    node('D-6', 'Zone D-6 (Industrial)', 'DemandPoint', D6, 1612, { baseDemandGPM: 130, zone: 'Industrial' }),
    node('D-3', 'Zone D-3 (Residential)', 'DemandPoint', D3, 1642, { baseDemandGPM: 190, zone: 'Residential' }),
    node('D-4', 'Zone D-4 (Residential)', 'DemandPoint', D4, 1648, { baseDemandGPM: 150, zone: 'Residential' }),

    edge('E-01', 'Bulk Main E-01', 'WaterMain', 'TP-1', 'PS-1', 600, 'Ductile Iron', 1800, 92, [TP1, [17.025, -22.519], PS1]),
    edge('E-02', 'Bulk Main E-02', 'WaterMain', 'PS-1', 'R-1', 600, 'Ductile Iron', 1800, 90, [PS1, [17.044, -22.532], R1]),
    edge('E-03', 'Transfer Main E-03', 'WaterMain', 'R-1', 'PS-2', 400, 'Ductile Iron', 600, 84, [R1, [17.07, -22.542], PS2]),
    edge('E-04', 'Transfer Main E-04', 'WaterMain', 'PS-2', 'R-2', 400, 'HDPE', 600, 88, [PS2, [17.096, -22.55], R2]),
    edge('E-05', 'Distribution Pipe E-05', 'Pipe', 'R-1', 'D-1', 300, 'PVC', 450, 95, [R1, [17.05, -22.55], D1]),
    edge('E-06', 'Distribution Pipe E-06', 'Pipe', 'R-1', 'D-2', 300, 'Ductile Iron', 550, 62, [R1, [17.063, -22.554], D2]),
    edge('E-07', 'Distribution Pipe E-07', 'Pipe', 'R-2', 'D-3', 250, 'Ductile Iron', 350, 17, [R2, [17.108, -22.568], D3]),
    edge('E-08', 'Distribution Pipe E-08', 'Pipe', 'R-2', 'D-4', 250, 'HDPE', 300, 93, [R2, [17.119, -22.563], D4]),
    edge('E-09', 'Distribution Pipe E-09', 'Pipe', 'D-1', 'D-5', 200, 'PVC', 250, 78, [D1, [17.038, -22.568], D5]),
    edge('E-10', 'Distribution Pipe E-10', 'Pipe', 'D-2', 'D-6', 200, 'Ductile Iron', 250, 33, [D2, [17.078, -22.58], D6]),
    // Emergency interconnects: normally closed (grey). Invented for this prototype.
    edge('E-11', 'Emergency Interconnect E-11', 'Pipe', 'D-4', 'D-3', 200, 'HDPE', 300, 90, [D4, [17.115, -22.574], D3], true),
    edge('E-12', 'Emergency Interconnect E-12', 'Pipe', 'D-5', 'D-2', 250, 'PVC', 350, 90, [D5, [17.05, -22.575], D2], true),
  ],
};