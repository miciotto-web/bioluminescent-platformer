extends Node
class_name LightSystem

signal energy_changed(current_energy: float, max_energy: float)

@export var max_energy: float = 100.0
@export var beam_cost: float = 12.0
@export var passive_regen_per_sec: float = 2.5

var current_energy: float = 100.0

func _ready() -> void:
	current_energy = max_energy
	energy_changed.emit(current_energy, max_energy)

func _process(delta: float) -> void:
	if current_energy < max_energy:
		recover_energy(passive_regen_per_sec * delta)

func consume_energy(amount: float) -> bool:
	if current_energy < amount:
		return false
	current_energy = maxf(0.0, current_energy - amount)
	energy_changed.emit(current_energy, max_energy)
	return true

func recover_energy(amount: float) -> void:
	current_energy = minf(max_energy, current_energy + amount)
	energy_changed.emit(current_energy, max_energy)

func get_energy_ratio() -> float:
	if max_energy <= 0.0:
		return 0.0
	return clampf(current_energy / max_energy, 0.0, 1.0)
