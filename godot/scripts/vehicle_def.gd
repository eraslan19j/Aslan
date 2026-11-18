# VehicleDef — TEK ARAÇ TANIMI (ADR-012)
#
# KURAL: Oyuncu aracı ile NPC araçları bu tek tanımdan üretilir.
#        `replace_model()`, `create_player_rig()`, `build_traffic_mesh()`
#        gibi ikinci bir hat YOKTUR ve yazılmayacaktır.
#
# NEDEN BU DOSYA VAR:
#   Eski oyunda iki hat vardı:
#     vehicleMesh.ts:513  createPlayerTaxiRig()      <- oyuncu
#     vehicleMesh.ts:151  buildTrafficClassGeometries() <- NPC
#   Sonuç: NPC'lerde iç mekân yok, cam opak, gövde farklı.
#   H1 hatasının kök nedeni buydu.
#
# FAZ 1 HEDEFİ: gövde profilini `side_profile` ile tanımla, aynı fonksiyon
# hem oyuncu hem NPC mesh'ini üretsin. Tek fark `player_controlled` bayrağı.

extends RefCounted
class_name VehicleDef

# --- Gövde ölçüleri (metre) ---
const LENGTH := 4.42
const WIDTH := 1.82
const HEIGHT := 0.62          # taban gövde yüksekliği
const CABIN_HEIGHT := 0.52
const WHEEL_RADIUS := 0.34
const WHEEL_WIDTH := 0.24

# --- Gövde profili (yan görünüm, X = uzunluk, Y = yükseklik) ---
# Bu noktalar gövdenin silüetini tanımlar. Kutu değil, araba.
# Sıralı: ön tampon -> kaput -> ön cam -> tavan -> arka cam -> bagaj -> arka tampon
const SIDE_PROFILE: Array[Vector2] = [
	Vector2(-2.21, 0.18),   # arka tampon alt
	Vector2(-2.21, 0.62),   # arka tampon üst
	Vector2(-1.95, 0.72),   # bagaj
	Vector2(-1.42, 0.86),   # arka cam başlangıcı
	Vector2(-0.92, 1.18),   # tavan arka
	Vector2(0.38, 1.18),    # tavan ön
	Vector2(0.86, 0.90),    # ön cam bitişi
	Vector2(1.86, 0.80),    # kaput
	Vector2(2.21, 0.66),    # ön tampon üst
	Vector2(2.21, 0.18),    # ön tampon alt
]

# --- Dingil mesafesi ---
const FRONT_AXLE := 1.42
const REAR_AXLE := -1.38


static func wheel_positions() -> Array[Vector3]:
	var xs := [-WHEEL_WIDTH * 0.5, WHEEL_WIDTH * 0.5]
	var out: Array[Vector3] = []
	for zs in [FRONT_AXLE, REAR_AXLE]:
		for x in xs:
			for y in [-WHEEL_RADIUS * 0.1]:
				out.append(Vector3(float(x), float(y), float(zs)))
	return out


# Gövde mesh'i: yan profili kalınlaştır (extrude)
# Tek üretici — hem oyuncu hem NPC bunu çağırır.
static func build_body(st: SurfaceTool) -> void:
	var half := WIDTH * 0.5
	var n := SIDE_PROFILE.size()

	# Sol ve sağ yan yüzeyler (profil polygon'u)
	for sgn in [-1.0, 1.0]:
		var x := float(sgn) * half
		# Dış yüzey şeritleri (profil boyunca)
		for i in range(1, n - 1):
			var a: Vector2 = SIDE_PROFILE[0]
			var b: Vector2 = SIDE_PROFILE[i]
			var c: Vector2 = SIDE_PROFILE[i + 1]
			if float(sgn) < 0.0:
				st.add_vertex(Vector3(x, a.y, a.x))
				st.add_vertex(Vector3(x, c.y, c.x))
				st.add_vertex(Vector3(x, b.y, b.x))
			else:
				st.add_vertex(Vector3(x, a.y, a.x))
				st.add_vertex(Vector3(x, b.y, b.x))
				st.add_vertex(Vector3(x, c.y, c.x))

	# Profil çevresini sağdan sola bağla (tavan, kaput, tamponlar)
	for i in n:
		var j := (i + 1) % n
		var p: Vector2 = SIDE_PROFILE[i]
		var q: Vector2 = SIDE_PROFILE[j]
		var l0 := Vector3(-half, p.y, p.x)
		var l1 := Vector3(-half, q.y, q.x)
		var r0 := Vector3(half, p.y, p.x)
		var r1 := Vector3(half, q.y, q.x)
		st.add_vertex(l0)
		st.add_vertex(r0)
		st.add_vertex(r1)
		st.add_vertex(l0)
		st.add_vertex(r1)
		st.add_vertex(l1)


# Kabin/cam bölgesi: ayrı materyal (saydam) için ayrı yüzey
# K8 kuralı: NPC'lerde de aynı cam materyali kullanılır (opak değil).
static func build_glass(st: SurfaceTool) -> void:
	var half := WIDTH * 0.5 + 0.005   # gövdenin 5 mm dışında -> z-fighting yok
	# Ön cam
	_quad(st,
		Vector3(-half, 0.90, 0.86), Vector3(half, 0.90, 0.86),
		Vector3(half, 1.18, 0.38), Vector3(-half, 1.18, 0.38))
	# Arka cam
	_quad(st,
		Vector3(-half, 1.18, -0.92), Vector3(half, 1.18, -0.92),
		Vector3(half, 0.86, -1.42), Vector3(-half, 0.86, -1.42))
	# Yan camlar (sol/sağ)
	for sgn in [-1.0, 1.0]:
		var x := float(sgn) * half
		_quad(st,
			Vector3(x, 0.92, 0.62), Vector3(x, 0.92, -0.88),
			Vector3(x, 1.14, -0.88), Vector3(x, 1.14, 0.62))


static func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3) -> void:
	st.add_vertex(a)
	st.add_vertex(b)
	st.add_vertex(c)
	st.add_vertex(a)
	st.add_vertex(c)
	st.add_vertex(d)


# Tekerlek: silindir, X ekseni etrafında
static func build_wheel(st: SurfaceTool, center: Vector3, seg: int) -> void:
	var r := WHEEL_RADIUS
	var hw := WHEEL_WIDTH * 0.5
	for i in seg:
		var a0 := TAU * float(i) / float(seg)
		var a1 := TAU * float(i + 1) / float(seg)
		var y0 := cos(a0) * r
		var z0 := sin(a0) * r
		var y1 := cos(a1) * r
		var z1 := sin(a1) * r
		var p0 := center + Vector3(-hw, y0, z0)
		var p1 := center + Vector3(hw, y0, z0)
		var p2 := center + Vector3(hw, y1, z1)
		var p3 := center + Vector3(-hw, y1, z1)
		st.add_vertex(p0)
		st.add_vertex(p1)
		st.add_vertex(p2)
		st.add_vertex(p0)
		st.add_vertex(p2)
		st.add_vertex(p3)
	# Kapak
	var cL := center + Vector3(-hw, 0, 0)
	var cR := center + Vector3(hw, 0, 0)
	for i in seg:
		var a0 := TAU * float(i) / float(seg)
		var a1 := TAU * float(i + 1) / float(seg)
		st.add_vertex(cL)
		st.add_vertex(cL + Vector3(0, cos(a1) * r, sin(a1) * r))
		st.add_vertex(cL + Vector3(0, cos(a0) * r, sin(a0) * r))
		st.add_vertex(cR)
		st.add_vertex(cR + Vector3(0, cos(a0) * r, sin(a0) * r))
		st.add_vertex(cR + Vector3(0, cos(a1) * r, sin(a1) * r))
