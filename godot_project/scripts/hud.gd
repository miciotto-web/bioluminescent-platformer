extends CanvasLayer
class_name GameHUD

@onready var light_bar: ProgressBar = $TopBar/LightEnergyBar
@onready var health_label: Label = $TopBar/HealthLabel
@onready var purification_label: Label = $TopBar/PurificationLabel
@onready var virtual_dpad: Control = get_node_or_null("BottomControls/VirtualDPad")

const DEADZONE_RATIO: float = 0.18
const SECTORS: Array[String] = [
	"RIGHT",
	"DOWN_RIGHT",
	"DOWN",
	"DOWN_LEFT",
	"LEFT",
	"UP_LEFT",
	"UP",
	"UP_RIGHT"
]

var dpad_touch_index: int = -1
var current_direction: String = "NEUTRAL"

func update_health(current_hp: int, max_hp: int) -> void:
	if health_label:
		health_label.text = "HP %d/%d" % [current_hp, max_hp]

func update_light_energy(current_energy: float, max_energy: float) -> void:
	if light_bar:
		light_bar.max_value = max_energy
		light_bar.value = current_energy

func update_purification(percent: int) -> void:
	if purification_label:
		purification_label.text = "Purificazione: %d%%" % percent

func evaluate_dpad_offset(offset: Vector2, radius: float) -> String:
	var safe_radius: float = maxf(24.0, radius)
	if offset.length() < safe_radius * DEADZONE_RATIO:
		return "NEUTRAL"
	var angle_deg: float = rad_to_deg(atan2(offset.y, offset.x))
	var shifted: float = fposmod(angle_deg + 22.5, 360.0)
	var sector_idx: int = int(floor(shifted / 45.0)) % 8
	return SECTORS[sector_idx]

func _apply_dpad_direction(dir: String) -> void:
	current_direction = dir
	var move_left: bool = dir == "LEFT" or dir == "UP_LEFT" or dir == "DOWN_LEFT"
	var move_right: bool = dir == "RIGHT" or dir == "UP_RIGHT" or dir == "DOWN_RIGHT"
	if move_left and not move_right:
		Input.action_press("move_left")
		Input.action_release("move_right")
	elif move_right and not move_left:
		Input.action_press("move_right")
		Input.action_release("move_left")
	else:
		Input.action_release("move_left")
		Input.action_release("move_right")
