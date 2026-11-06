export type NodeType = 'TreatmentPlant' | 'PumpStation' | 'Reservoir' | 'DemandPoint';
export type EdgeKind = 'WaterMain' | 'Pipe';
export type PipeMaterial = 'Ductile Iron' | 'PVC' | 'HDPE';
export type LonLat = [number, number];

export interface NodeProps {
  kind: 'node';
  id: string;
  name: string;
  nodeType: NodeType;
  elevationM: number;
  capacityGPM?: number; // TreatmentPlant / PumpStation rated flow
  pumpHeadM?: number; // PumpStation boost
  capacityGal?: number; // Reservoir
  initialPct?: number;
  tankDepthM?: number;
  baseDemandGPM?: number; // DemandPoint
  zone?: 'Residential' | 'Industrial';
}

export interface EdgeProps {
  kind: 'edge';
  id: string;
  name: string;
  edgeType: EdgeKind;
  from: string;
  to: string;
  diameterMm: number;
  material: PipeMaterial;
  capacityGPM: number;
  condition: number; normallyClosed?: boolean; // initial 0-100
}

export interface NodeFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: LonLat };
  properties: NodeProps;
}
export interface EdgeFeature {
  type: 'Feature';
  geometry: { type: 'LineString'; coordinates: LonLat[] };
  properties: EdgeProps;
}
export type NetworkFeature = NodeFeature | EdgeFeature;
export interface NetworkCollection {
  type: 'FeatureCollection';
  name: string;
  features: NetworkFeature[];
}

export const isNodeFeature = (f: NetworkFeature): f is NodeFeature => f.properties.kind === 'node';
export const isEdgeFeature = (f: NetworkFeature): f is EdgeFeature => f.properties.kind === 'edge';