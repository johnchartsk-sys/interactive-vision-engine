import { Button } from '@/components/ui/button';
import { Sparkline } from './CommandGraphics';
import { Activity, MapPin, type LucideIcon } from 'lucide-react';
import mapAsset from '@/assets/map.jpg.asset.json';
export type Sector = {name:string; icon:LucideIcon; image:string; items:{name:string;icon:LucideIcon}[]; metric:string; value:string; location:string; secondary?:string};
export function InfrastructurePanel({sector,onOpen}:{sector:Sector;onOpen:(name:string,category?:string)=>void}){
 const Icon=sector.icon;
 return <section className="sector-panel" aria-label={sector.name}>
 <div className="panel-heading"><Button variant="sector" onClick={()=>onOpen(sector.name,'Infrastructure overview')}><Icon/>{sector.name}</Button><span className="panel-live">MONITORING</span></div>
 <div className="sector-content"><Button variant="console" className="photo-button" aria-label={`${sector.name} physical infrastructure`} onClick={()=>onOpen(sector.location,sector.name)}><img src={sector.image} alt={sector.location}/><span className="photo-caption"><span>{sector.location}</span><MapPin size={10}/></span></Button>
 <div className="asset-list">{sector.items.map(item=><Button variant="console" key={item.name} onClick={()=>onOpen(item.name,sector.name)}><item.icon/>{item.name}</Button>)}</div></div>
 <div className="sector-foot"><Button variant="console" className="metric" onClick={()=>onOpen(sector.metric,sector.name)}><span>{sector.metric}<strong>{sector.value}</strong></span></Button><Sparkline seed={sector.name.length*.5}/>{sector.secondary?<Button variant="console" onClick={()=>onOpen('Flow',sector.name)}><span>Flow<strong className="block">{sector.secondary}</strong></span></Button>:<Button variant="console" aria-label={`${sector.name} network map`} onClick={()=>onOpen('Network map',sector.name)}><img className="mini-map" src={mapAsset.url} alt="Infrastructure network"/></Button>}<Activity className="hidden"/></div>
 </section>;
}
