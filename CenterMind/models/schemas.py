# -*- coding: utf-8 -*-
"""Modelos Pydantic compartidos por todos los routers."""
from typing import List, Optional
from pydantic import BaseModel


class LoginRequest(BaseModel):
    usuario: str
    password: str


class EvaluarRequest(BaseModel):
    ids_exhibicion: List[int]
    estado: str
    supervisor: str
    comentario: str = ""


class IntegranteUpdateRequest(BaseModel):
    nombre_integrante: str
    rol_telegram: str | None = None
    id_vendedor_erp: str | None = None


class LocationRequest(BaseModel):
    ciudad: str
    provincia: str
    label: str
    lat: float | None = 0.0
    lon: float | None = 0.0


class RevertirRequest(BaseModel):
    ids_exhibicion: List[int]


class DistribuidoraRequest(BaseModel):
    nombre: str
    token: str
    carpeta_drive: str = ""
    ruta_cred: str = ""


class UsuarioRequest(BaseModel):
    dist_id: int
    login: str
    password: str
    rol: str


class UsuarioEditRequest(BaseModel):
    login: str
    rol: str
    password: str = ""


class IntegranteRolRequest(BaseModel):
    rol: str
    distribuidor_id: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    usuario: str
    rol: str
    id_usuario: int
    id_distribuidor: Optional[int] = None
    nombre_empresa: Optional[str] = None
    is_superadmin: bool = False
    usa_quarentena: bool = False
    usa_contexto_erp: bool = False
    usa_mapeo_vendedores: bool = False
    show_tutorial: bool = False
    permisos: dict = {}


class MapeoVendedorRequest(BaseModel):
    id_vendedor: Optional[int] = None


class AsignarVendedorRequest(BaseModel):
    id_integrante: int | None = None


class MappingItem(BaseModel):
    id_integrante: int
    location_id: str | None = None
    id_vendedor_erp: str | None = None


class BulkMappingRequest(BaseModel):
    mappings: List[MappingItem]


class IntegranteRequest(BaseModel):
    nombre_integrante: str
    rol_telegram: str | None = None
    location_id: str | None = None
    telegram_user_id: int | None = None
    telegram_group_id: int | None = None


class ERPConfigAlertas(BaseModel):
    limite_dinero: float
    limite_cbte: int
    limite_dias: int
    activo: bool = True
    limite_dinero_activo: bool = True
    limite_cbte_activo: bool = True
    limite_dias_activo: bool = True
    excepciones: List[dict] = []


class ReporteQuery(BaseModel):
    fecha_desde: str
    fecha_hasta: str
    vendedores: List[str] = []
    estados: List[str] = []
    tipos_pdv: List[str] = []
    sucursales: List[str] = []
    nro_cliente: str = ""


class BonusConfigPayload(BaseModel):
    anio: int
    mes: int
    umbral: int = 0
    monto_bono_fijo: float = 0.0
    monto_por_punto: float = 0.0
    puestos: List[dict] = []


class ObjetivoItemCreate(BaseModel):
    """Un PDV dentro de un objetivo multi-PDV."""
    id_cliente_pdv: int
    nombre_pdv: Optional[str] = None
    # Campos de ruteo (solo para tipo='ruteo')
    accion_ruteo: Optional[str] = None       # 'cambio_ruta' | 'baja'
    id_ruta_destino: Optional[int] = None    # FK rutas_v2.id_ruta (requerido si cambio_ruta)
    motivo_baja: Optional[str] = None        # Requerido si baja
    orden_sugerido: Optional[int] = None
    metadata_ruteo: Optional[dict] = None


class ObjetivoCreate(BaseModel):
    id_distribuidor: int
    id_vendedor: int
    tipo: str
    id_target_pdv: Optional[int] = None
    id_target_ruta: Optional[int] = None
    descripcion: Optional[str] = None
    nombre_pdv: Optional[str] = None
    nombre_vendedor: Optional[str] = None
    estado_inicial: Optional[str] = None
    estado_objetivo: Optional[str] = None
    valor_objetivo: Optional[float] = None
    fecha_objetivo: Optional[str] = None
    # Multi-PDV: lista de ítems para exhibicion/alteo/activacion
    pdv_items: Optional[List[ObjetivoItemCreate]] = None
    id_objetivo_padre: Optional[str] = None
    resultado_final: Optional[str] = None


class ObjetivoUpdate(BaseModel):
    valor_actual: Optional[float] = None
    descripcion: Optional[str] = None
    estado_objetivo: Optional[str] = None
    fecha_objetivo: Optional[str] = None
    resultado_final: Optional[str] = None
    kanban_phase: Optional[str] = None


class ObjetivoTimelineEvent(BaseModel):
    id: Optional[str] = None
    id_objetivo: str
    tipo_evento: str
    id_referencia: Optional[str] = None
    metadata: Optional[dict] = None
    created_at: Optional[str] = None


class ObjetivoTimeline(BaseModel):
    id_objetivo: str
    nombre_vendedor: Optional[str] = None
    tipo: Optional[str] = None
    descripcion: Optional[str] = None
    fecha_objetivo: Optional[str] = None
    kanban_phase: Optional[str] = None
    resultado_final: Optional[str] = None
    eventos: List[ObjetivoTimelineEvent] = []


class RolePermission(BaseModel):
    rol: str
    permiso_key: str
    valor: bool


class RolePermissionUpdate(BaseModel):
    permissions: List[RolePermission]
