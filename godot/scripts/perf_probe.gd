# PerfProbe — Faz 0.5 performans ölçümü (K5)
#
# Ne ölçer:
#   - kare süresi (ms, ortalama + p95 + 1% low)
#   - kare/s (FPS)
#   - draw call, üçgen sayısı, materyal
#   - GPU adı, Vulkan/GLES3, ekran çözünürlüğü
#   - ilk 60 kare atılır (warmup)
#
# Çıktı: ekranda canlı sayaç + 5 sn'de bir konsol logu (JSON)
# Telefonda: geri tuşu / ekrana 3 parmak dokunma -> panoya JSON kopyalar
#
# KURAL: Yalan ölçüm yok. Değerler `Performance` singleton'ından okunur,
# uydurulmaz. Isınma periyodu atlanır.

extends Node

const WARMUP_FRAMES := 60
const LOG_INTERVAL_SEC := 5.0
const SAMPLE_WINDOW := 300  # son 300 kare (5 sn @ 60fps)

var _warmup_done := false

var _frame_ms: Array[float] = []
var _frames_seen := 0
var _log_timer := 0.0
var _label: Label
var _level_tag: Label
var _touch_count := 0
var _last_level := ""


func _ready() -> void:
	# Ekran üstü sayaç (UI katmanı L5 — sadece okur)
	var canvas := CanvasLayer.new()
	canvas.name = "ProbeUI"
	add_child(canvas)

	_level_tag = Label.new()
	_level_tag.position = Vector2(24, 18)
	_level_tag.add_theme_font_size_override("font_size", 22)
	_level_tag.add_theme_color_override("font_color", Color(0.55, 1.0, 0.6))
	_level_tag.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	_level_tag.add_theme_constant_override("outline_size", 6)
	canvas.add_child(_level_tag)

	_label = Label.new()
	_label.position = Vector2(24, 44)
	_label.add_theme_font_size_override("font_size", 22)
	_label.add_theme_color_override("font_color", Color(1, 1, 0.4))
	_label.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	_label.add_theme_constant_override("outline_size", 6)
	canvas.add_child(_label)

	_print_device_info()


func _input(event: InputEvent) -> void:
	# 3 parmak dokunma -> raporu panoya kopyala
	if event is InputEventScreenTouch and event.pressed:
		_touch_count += 1
		if _touch_count >= 3:
			_touch_count = 0
			_copy_report()


func _process(delta: float) -> void:
	_frames_seen += 1
	var ms := delta * 1000.0

	# Isınma periyodunu atla (ilk kareler shader derlemesi içerir)
	if not _warmup_done:
		if _frames_seen <= WARMUP_FRAMES:
			_label.text = "ısınıyor… %d/%d" % [_frames_seen, WARMUP_FRAMES]
			return
		_warmup_done = true

	_frame_ms.append(ms)
	if _frame_ms.size() > SAMPLE_WINDOW:
		_frame_ms.pop_front()

	_log_timer += delta
	if _log_timer >= LOG_INTERVAL_SEC:
		_log_timer = 0.0
		_emit_log()

	if _level_tag != null:
		var world := get_parent().get_node_or_null("PrototypeWorld")
		if world != null and world.has_method("get_level_name"):
			var lname: String = world.get_level_name()
			var tris: int = world.get_tri_total()
			_level_tag.text = "SEVİYE: %s — %s üçgen" % [lname, _fmt(tris)]
			# seviye değişince ölçümü sıfırla (ısınma yeniden)
			if lname != _last_level:
				_last_level = lname
				_frame_ms.clear()
				_frames_seen = 0
				_warmup_done = false
	_label.text = _summary_line()


func _summary_line() -> String:
	var s := _stats()
	return "%.1f FPS | %.2f ms (p95 %.2f) | draw %d | tri %.1fk\n%s | %s" % [
		s.fps, s.mean_ms, s.p95_ms, s.draw_calls,
		s.triangles / 1000.0, s.gpu, s.renderer,
	]


func _stats() -> Dictionary:
	var n := _frame_ms.size()
	if n == 0:
		return {
			"fps": 0.0, "mean_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0,
			"min_fps": 0.0, "draw_calls": 0, "triangles": 0,
			"gpu": _gpu_name(), "renderer": _renderer_name(),
		}

	var sorted: Array[float] = _frame_ms.duplicate()
	sorted.sort()
	var total := 0.0
	for v: float in _frame_ms:
		total += v
	var mean := total / float(n)

	var i95: int = mini(int(float(n) * 0.95), n - 1)
	var i99: int = mini(int(float(n) * 0.99), n - 1)
	var p95: float = sorted[i95]
	var p99: float = sorted[i99]

	return {
		"fps": 1000.0 / mean if mean > 0.0 else 0.0,
		"mean_ms": mean,
		"p95_ms": p95,
		"p99_ms": p99,
		"min_fps": (1000.0 / sorted[n - 1]) if sorted[n - 1] > 0.0 else 0.0,
		"draw_calls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		"triangles": int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)),
		"objects": int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)),
		"gpu": _gpu_name(),
		"renderer": _renderer_name(),
	}


func _gpu_name() -> String:
	var adapter := RenderingServer.get_video_adapter_name()
	return adapter if adapter != "" else "bilinmiyor"


func _renderer_name() -> String:
	match RenderingServer.get_current_rendering_method():
		"mobile":
			return "mobile(vulkan)"
		"gl_compatibility":
			return "compatibility(gles3)"
		"forward_plus":
			return "forward+"
		_:
			return RenderingServer.get_current_rendering_method()


func _stress_info() -> Dictionary:
	var n := get_parent().get_node_or_null("StressProbe")
	if n != null and n.has_method("get_stress"):
		return n.get_stress()
	return {}


func _device_info() -> Dictionary:
	return {
		"app": ProjectSettings.get_setting("application/config/name", "?"),
		"version": ProjectSettings.get_setting("application/config/version", "?"),
		"os": OS.get_name(),
		"os_version": OS.get_version(),
		"model": OS.get_model_name(),
		"processor_count": OS.get_processor_count(),
		"screen": "%dx%d" % [
			DisplayServer.screen_get_size().x, DisplayServer.screen_get_size().y,
		],
		"gpu": _gpu_name(),
		"gpu_vendor": RenderingServer.get_video_adapter_vendor(),
		"renderer": _renderer_name(),
		"engine": "Godot %s" % Engine.get_version_info().get("string", "?"),
	}


func _print_device_info() -> void:
	print("[PerfProbe] DEVICE ", JSON.stringify(_device_info()))


func _emit_log() -> void:
	var s := _stats()
	var payload := {
		"kind": "perf_sample",
		"device": _device_info(),
		"stress": _stress_info(),
		"fps": snappedf(s.fps, 0.1),
		"mean_ms": snappedf(s.mean_ms, 0.01),
		"p95_ms": snappedf(s.p95_ms, 0.01),
		"p99_ms": snappedf(s.p99_ms, 0.01),
		"min_fps": snappedf(s.min_fps, 0.1),
		"draw_calls": s.draw_calls,
		"triangles": s.triangles,
		"objects": s.objects,
	}
	print("[PerfProbe] SAMPLE ", JSON.stringify(payload))


func _copy_report() -> void:
	var s := _stats()
	var payload := {
		"kind": "perf_report",
		"device": _device_info(),
		"stress": _stress_info(),
		"stats": {
			"fps": snappedf(s.fps, 0.1),
			"mean_ms": snappedf(s.mean_ms, 0.01),
			"p95_ms": snappedf(s.p95_ms, 0.01),
			"p99_ms": snappedf(s.p99_ms, 0.01),
			"min_fps": snappedf(s.min_fps, 0.1),
			"draw_calls": s.draw_calls,
			"triangles": s.triangles,
			"objects": s.objects,
		},
		"level": _last_level,
		"sample_frames": _frame_ms.size(),
	}
	var text := JSON.stringify(payload, "  ")
	DisplayServer.clipboard_set(text)
	print("[PerfProbe] REPORT_COPIED ", text)


func _fmt(n: int) -> String:
	if n >= 1000000:
		return "%.1fM" % (float(n) / 1000000.0)
	if n >= 1000:
		return "%.1fk" % (float(n) / 1000.0)
	return str(n)
