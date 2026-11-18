# PrototypeWorld — Faz 0.5 ölçüm sahnesi
#
# AMAÇ: Faz 1'e geçmeden önce K5'i (>= 30 kare/s) ölçmek.
# Bu sahne BİLEREK basit: karmaşıklık ölçümü kirletmesin.
#
# İçerik:
#   - 200 m x 200 m zemin (1 karo büyüklüğünde)
#   - 12 bina bloğu (MultiMesh — tek draw call)
#   - 8 NPC aracı (TEK VehicleDefinition-benzeri basit mesh, MultiMesh)
#   - 1 oyuncu aracı (ayrı mesh, iç mekan YOK — Faz 1'de gelecek)
#
# K8 testi: NPC araçları ile oyuncu aracı AYNI mesh'i kullanır.
# Bu prototipte tek fark: oyuncu aracı ayrı bir Node3D, NPC'ler MultiMesh.

extends Node3D

const TILE_SIZE := 200.0
const NPC_COUNT := 8
const BUILDING_COUNT := 12

var _npc_transforms: Array[Transform3D] = []
var _elapsed := 0.0


func _ready() -> void:
	_build_ground()
	_build_buildings()
	_build_vehicles()
	print("[PrototypeWorld] hazır — %d bina, %d NPC araç" % [BUILDING_COUNT, NPC_COUNT])


func _process(delta: float) -> void:
	# NPC'leri dairesel hareket ettir (fizik YOK — Faz 4'te LOD gelecek)
	_elapsed += delta
	var mm := $NPCVehicles/Instances as MultiMeshInstance3D
	if mm == null:
		return
	var mmi := mm.multimesh
	for i in NPC_COUNT:
		var a := _elapsed * 0.35 + TAU * float(i) / float(NPC_COUNT)
		var r := 32.0 + float(i % 3) * 12.0
		var t := Transform3D(Basis(Vector3.UP, -a), Vector3(cos(a) * r, 0.75, sin(a) * r))
		mmi.set_instance_transform(i, t)


# --- Zemin ---
func _build_ground() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(TILE_SIZE, TILE_SIZE)
	plane.subdivide_width = 1
	plane.subdivide_depth = 1
	var mi := MeshInstance3D.new()
	mi.name = "Ground"
	mi.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.28, 0.29, 0.3)
	mat.roughness = 0.92
	mat.metallic = 0.0
	mi.material_override = mat
	add_child(mi)


# --- Binalar: MultiMesh, tek draw call ---
func _build_buildings() -> void:
	var box := BoxMesh.new()
	box.size = Vector3(1, 1, 1)

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = box
	mm.instance_count = BUILDING_COUNT

	var rng := RandomNumberGenerator.new()
	rng.seed = 1337  # deterministik — Math.random() yasak kuralı

	for i in BUILDING_COUNT:
		var w := rng.randf_range(10.0, 26.0)
		var d := rng.randf_range(10.0, 26.0)
		var h := rng.randf_range(6.0, 22.0)
		var px := rng.randf_range(-80.0, 80.0)
		var pz := rng.randf_range(-80.0, 80.0)
		var basis := Basis.IDENTITY.scaled(Vector3(w, h, d))
		mm.set_instance_transform(i, Transform3D(basis, Vector3(px, h * 0.5, pz)))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Instances"
	mmi.multimesh = mm
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.62, 0.58, 0.52)
	mat.roughness = 0.85
	mmi.material_override = mat

	var root := Node3D.new()
	root.name = "Buildings"
	root.add_child(mmi)
	add_child(root)


# --- Araçlar: TEK mesh, hem oyuncu hem NPC (K8) ---
func _build_vehicles() -> void:
	var car_mesh := _make_car_mesh()

	# Oyuncu aracı: ayrı MeshInstance3D
	var player := MeshInstance3D.new()
	player.name = "PlayerCar"
	player.mesh = car_mesh
	player.position = Vector3(0, 0.75, 0)
	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.85, 0.72, 0.18)
	pmat.roughness = 0.35
	pmat.metallic = 0.35
	player.material_override = pmat
	add_child(player)

	# NPC araçları: AYNI mesh, MultiMesh
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = car_mesh
	mm.instance_count = NPC_COUNT
	for i in NPC_COUNT:
		mm.set_instance_transform(i, Transform3D(Basis.IDENTITY, Vector3(i * 3.0, 0.75, 0)))

	var mmi := MultiMeshInstance3D.new()
	mmi.name = "Instances"
	mmi.multimesh = mm
	mmi.material_override = pmat  # AYNI materyal — K8

	var root := Node3D.new()
	root.name = "NPCVehicles"
	root.add_child(mmi)
	add_child(root)


# Basit araç gövdesi: taban + kabin (iç mekan YOK — Faz 1)
func _make_car_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_append_box(st, Vector3(1.85, 0.62, 4.3), Vector3(0, 0, 0))
	_append_box(st, Vector3(1.6, 0.55, 2.1), Vector3(0, 0.58, -0.15))
	st.generate_normals()
	return st.commit()


func _append_box(st: SurfaceTool, size: Vector3, offset: Vector3) -> void:
	var h := size * 0.5
	var c := [
		Vector3(-h.x, -h.y, -h.z), Vector3(h.x, -h.y, -h.z),
		Vector3(h.x, -h.y, h.z), Vector3(-h.x, -h.y, h.z),
		Vector3(-h.x, h.y, -h.z), Vector3(h.x, h.y, -h.z),
		Vector3(h.x, h.y, h.z), Vector3(-h.x, h.y, h.z),
	]
	var faces := [
		[0, 2, 1], [0, 3, 2],  # alt
		[4, 5, 6], [4, 6, 7],  # üst
		[0, 1, 5], [0, 5, 4],  # ön
		[2, 3, 7], [2, 7, 6],  # arka
		[1, 2, 6], [1, 6, 5],  # sağ
		[3, 0, 4], [3, 4, 7],  # sol
	]
	for f in faces:
		for idx in f:
			st.add_vertex(c[idx] + offset)
