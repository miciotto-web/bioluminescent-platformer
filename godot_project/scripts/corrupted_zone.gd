extends Area2D
class_name CorruptedZone

signal purification_updated(zone_id: String, current_percent: float, is_purified: bool)

@export var zone_id: String = "zone_radura_1"
@export var purification: float = 0.0
@export var max_purification: float = 100.0

var is_purified: bool = false

func apply_purification(amount: float) -> void:
	if is_purified:
		return
	purification = clampf(purification + amount, 0.0, max_purification)
	if purification >= max_purification:
		is_purified = true
	_update_visual_state()
	purification_updated.emit(zone_id, purification, is_purified)

func _update_visual_state() -> void:
	# Gradual transition from dark ground & dead particles to living flora & luminous particles
	pass
