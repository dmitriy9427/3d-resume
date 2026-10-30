"""
Генерация моделей для 3D-прогулки. Запуск:
  blender -b -P blender/make_assets.py
Результат: public/models/props.glb (улица) и public/models/room.glb (комната).
Единицы — метры. Blender +Y (вперёд) = three.js -Z.
"""
import bpy, os, math

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "models")
os.makedirs(OUT, exist_ok=True)


def hex_rgba(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    # sRGB -> linear
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (f(r), f(g), f(b), 1.0)


_mats = {}


def mat(name, color, rough=0.75, emit=None, strength=0.0, metal=0.0):
    key = (name, color, emit, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_rgba(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = hex_rgba(emit)
        bsdf.inputs["Emission Strength"].default_value = strength
    _mats[key] = m
    return m


def finish(o, m):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.clear()
    o.data.materials.append(m)
    return o


def box(size, loc, m, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    finish(o, m)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier="b")
    return o


def cyl(r, depth, loc, m, rot=(0, 0, 0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    return finish(bpy.context.active_object, m)


def ico(r, loc, m, sub=2, squash=1.0):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = bpy.context.active_object
    o.scale = (1, 1, squash)
    return finish(o, m)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    return o


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def export(path, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
    )
    print("exported", path, os.path.getsize(path) // 1024, "KB")


# ─── Улица ──────────────────────────────────────────────────────────────────
def lumpy(r, loc, m, sub=2, amp=0.22, squash=1.0, seed=0):
    """Икосфера со случайным смещением вершин — «комок» листвы."""
    import random
    rnd = random.Random(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = bpy.context.active_object
    for v in o.data.vertices:
        k = 1 + (rnd.random() * 2 - 1) * amp
        v.co.x *= k
        v.co.y *= k
        v.co.z *= k * squash
        if v.co.z < -r * 0.45 * squash:  # плоское дно кроны
            v.co.z = -r * 0.45 * squash
    return finish(o, m)


def branch(p0, p1, r0, r1, m):
    import mathutils
    a, b = mathutils.Vector(p0), mathutils.Vector(p1)
    d = b - a
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r0, radius2=r1, depth=d.length, location=(a + b) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return finish(o, m)


def tree():
    """Лиственное дерево: конусный ствол с расширением у земли, ветви, крона из комков."""
    bark = mat("bark", "#3b2a22", 0.95)
    dark = mat("leaf_dark", "#1f4d42", 0.9)
    mid = mat("leaf", "#2c6b55", 0.9)
    light = mat("leaf_light", "#3b8566", 0.9)
    parts = [
        branch((0, 0, 0), (0, 0, 2.5), 0.3, 0.13, bark),
        branch((0, 0, 2.2), (0.9, 0.3, 3.4), 0.11, 0.05, bark),
        branch((0, 0, 2.4), (-0.8, -0.5, 3.5), 0.1, 0.05, bark),
        branch((0, 0, 2.6), (0.1, 0.9, 3.6), 0.09, 0.04, bark),
    ]
    clumps = [
        ((0, 0, 3.7), 1.25, mid), ((0.95, 0.35, 3.4), 0.95, mid), ((-0.9, -0.5, 3.5), 1.0, dark),
        ((0.1, 0.95, 3.6), 0.9, dark), ((-0.5, 0.7, 4.2), 0.9, light), ((0.6, -0.6, 4.3), 0.95, light),
        ((0, 0.1, 4.6), 0.85, light), ((1.1, -0.3, 4.0), 0.7, mid), ((-1.1, 0.2, 4.0), 0.75, dark),
    ]
    for n, (loc, r, m) in enumerate(clumps):
        parts.append(lumpy(r, loc, m, amp=0.2, squash=0.85, seed=n + 3))
    return join(parts, "tree")


def tree_b():
    """Высокое узкое дерево (тополь): вертикальная крона из наложенных комков."""
    bark = mat("bark", "#3b2a22", 0.95)
    dark = mat("leaf_dark", "#1f4d42", 0.9)
    mid = mat("leaf", "#2c6b55", 0.9)
    light = mat("leaf_light", "#3b8566", 0.9)
    parts = [branch((0, 0, 0), (0, 0, 3.6), 0.24, 0.1, bark)]
    zs = [3.0, 3.8, 4.6, 5.4, 6.2, 6.9]
    for n, z in enumerate(zs):
        r = [0.95, 1.1, 1.05, 0.95, 0.75, 0.5][n]
        m = [dark, mid, mid, light, light, light][n]
        parts.append(lumpy(r, (0.12 * ((n % 2) * 2 - 1), 0.1 * (1 - (n % 3)), z), m, amp=0.18, squash=1.25, seed=n + 20))
    parts.append(lumpy(0.7, (0.55, 0.2, 3.7), dark, amp=0.2, squash=1.0, seed=40))
    parts.append(lumpy(0.65, (-0.5, -0.3, 4.3), mid, amp=0.2, squash=1.0, seed=41))
    return join(parts, "tree_b")


def bench():
    wood = mat("wood", "#6b4a35", 0.8)
    iron = mat("iron", "#1b1e2a", 0.5, metal=0.6)
    parts = [
        box((1.7, 0.45, 0.06), (0, 0, 0.45), wood),
        box((1.7, 0.06, 0.42), (0, -0.22, 0.75), wood, rot=(math.radians(-8), 0, 0)),
        box((0.06, 0.5, 0.45), (-0.75, 0, 0.22), iron),
        box((0.06, 0.5, 0.45), (0.75, 0, 0.22), iron),
        box((0.06, 0.06, 0.45), (-0.75, -0.24, 0.65), iron),
        box((0.06, 0.06, 0.45), (0.75, -0.24, 0.65), iron),
    ]
    return join(parts, "bench")


def bin_():
    green = mat("bin", "#27402f", 0.6, metal=0.3)
    dark = mat("bin_dark", "#151a18", 0.6)
    parts = [cyl(0.26, 0.85, (0, 0, 0.45), green, verts=10), cyl(0.29, 0.07, (0, 0, 0.9), dark, verts=10)]
    return join(parts, "bin")


def extrude_poly(pts, width, m, name="p", bevel=0.0):
    """Профиль в плоскости (y, z), выдавленный по x на ширину width."""
    import bmesh
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    hw = width / 2
    left = [bm.verts.new((-hw, y, z)) for y, z in pts]
    right = [bm.verts.new((hw, y, z)) for y, z in pts]
    bm.faces.new(left[::-1])
    bm.faces.new(right)
    n = len(pts)
    for k in range(n):
        a, b = k, (k + 1) % n
        bm.faces.new((left[a], left[b], right[b], right[a]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    finish(o, m)
    if bevel:
        mod = o.modifiers.new("b", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier="b")
    return o


CAR_STYLES = {
    # lower — силуэт кузова до линии окон (y вперёд, z вверх), glass — стёкла,
    # w — ширина кузова, r — радиус колеса, clear — клиренс, wing — задний спойлер
    # fastback — как Audi A7: длинный капот, плавная крыша до самого багажника
    "fastback": dict(
        lower=[(2.3, 0.36), (2.3, 0.7), (2.05, 0.84), (1.0, 0.9), (-1.0, 0.93), (-2.0, 0.92), (-2.3, 0.84), (-2.3, 0.36)],
        glass=[(1.0, 0.9), (0.25, 1.36), (-0.9, 1.42), (-1.8, 1.0), (-1.95, 0.92)],
        w=1.9, r=0.35, clear=0.0, wing=False),
    # super — как Ferrari F40: низкий клин, высокий задний спойлер
    "super": dict(
        lower=[(2.15, 0.26), (2.15, 0.48), (1.2, 0.66), (0.75, 0.76), (-0.3, 0.88), (-1.6, 0.96), (-2.1, 0.9), (-2.15, 0.28)],
        glass=[(0.75, 0.76), (0.15, 1.12), (-0.55, 1.15), (-1.25, 0.96)],
        w=1.96, r=0.34, clear=-0.04, wing=True),
    "suv": dict(
        lower=[(2.25, 0.44), (2.25, 0.94), (2.0, 1.06), (0.95, 1.12), (-2.1, 1.12), (-2.28, 1.0), (-2.28, 0.44)],
        glass=[(0.95, 1.12), (0.5, 1.74), (-1.95, 1.74), (-2.15, 1.12)],
        w=1.95, r=0.39, clear=0.1, wing=False),
    # van — как зелёный фургон 70-х: короткий капот, высокий грузовой кузов
    "van": dict(
        lower=[(2.3, 0.42), (2.3, 0.95), (2.05, 1.06), (1.65, 1.12), (-2.4, 1.12), (-2.4, 0.42)],
        glass=[(1.65, 1.12), (1.15, 1.74), (0.85, 1.74), (0.85, 1.12)],
        cargo=[(0.85, 1.1), (0.85, 1.98), (-2.35, 1.98), (-2.4, 1.1)],
        w=1.95, r=0.4, clear=0.12, wing=False),
}


def smooth(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
    except Exception:
        bpy.ops.object.shade_smooth()


def wheel(x, y, r, tire, rim, disc):
    out = []
    side = 1 if x > 0 else -1
    out.append(cyl(r, 0.26, (x, y, r), tire, rot=(0, math.radians(90), 0), verts=20))
    out.append(cyl(r * 0.66, 0.27, (x + side * 0.012, y, r), rim, rot=(0, math.radians(90), 0), verts=20))
    out.append(cyl(r * 0.5, 0.28, (x + side * 0.012, y, r), disc, rot=(0, math.radians(90), 0), verts=16))
    for k in range(5):
        out.append(box((0.03, r * 1.25, 0.06), (x + side * 0.03, y, r), rim, rot=(math.radians(k * 36), 0, 0)))
    out.append(cyl(r * 0.14, 0.3, (x + side * 0.03, y, r), disc, rot=(0, math.radians(90), 0), verts=8))
    return out


def car(name, color, style="fastback", extras=None):
    st = CAR_STYLES[style]
    w = st["w"]
    body = mat("car_" + color, color, 0.4, metal=0.1)
    glass = mat("glass", "#0a1020", 0.08, metal=0.3)
    black = mat("rubber", "#0a0a0d", 0.9)
    trim = mat("trim", "#15161c", 0.5)
    rim = mat("rim", "#b9bfce", 0.35, metal=0.3)
    disc = mat("disc", "#202228", 0.5, metal=0.6)
    head = mat("headlight", "#fff2cf", 0.3, "#fff2cf", 4.0)
    tail = mat("taillight", "#ff2a2a", 0.3, "#ff2a2a", 3.0)
    plate = mat("plate", "#e8e6dc", 0.6)
    chrome = mat("chrome", "#d8dce6", 0.3, metal=0.3)
    lo = st["lower"]
    front = max(p[0] for p in lo)
    rear = min(p[0] for p in lo)
    gl = st["glass"]
    top = max(p[1] for p in gl)
    r = st["r"]
    c = st["clear"]
    parts = [
        extrude_poly(lo, w, body, "body", bevel=0.1),
        extrude_poly(gl, w - 0.26, glass, "glass", bevel=0.05),
        # крыша: тонкая крышка того же цвета
        extrude_poly([(gl[1][0] + 0.02, top + 0.03), (gl[2][0] - 0.02, top + 0.03), (gl[2][0] - 0.06, top - 0.04), (gl[1][0] + 0.06, top - 0.04)], w - 0.3, body, "roof", bevel=0.03),
    ]
    if st.get("cargo"):
        parts.append(extrude_poly(st["cargo"], w, body, "cargo", bevel=0.07))
    # пороги и низ
    parts.append(box((w - 0.02, front - rear - 0.5, 0.1), (0, (front + rear) / 2, 0.3 + c), trim, bevel=0.02))
    # колёса, диски со спицами, арки
    wy_f, wy_r = front - 0.82, rear + 0.82
    for x in (-w / 2 + 0.03, w / 2 - 0.03):
        for y in (wy_f, wy_r):
            parts += wheel(x, y, r, black, rim, disc)
            parts.append(box((0.05, r * 2.35, r * 0.95), (x * 1.0, y, r + r * 1.0), trim))
    # передок: бампер, решётка, воздухозаборники, фары
    parts.append(box((w, 0.16, 0.24), (0, front - 0.04, 0.46 + c), trim, bevel=0.04))
    parts.append(box((w * 0.55, 0.05, 0.17), (0, front + 0.0, 0.66 + c), trim, bevel=0.01))
    parts.append(box((w * 0.5, 0.02, 0.012), (0, front + 0.02, 0.7 + c), chrome))
    for x in (-0.66, 0.66):
        parts.append(box((0.42, 0.06, 0.1), (x, front - 0.01, 0.74 + c), head, bevel=0.02))
        parts.append(box((0.3, 0.05, 0.09), (x * 1.25, front - 0.04, 0.5 + c), trim))
    parts.append(box((0.5, 0.02, 0.12), (0, front + 0.05, 0.42 + c), plate))
    # корма
    parts.append(box((w, 0.16, 0.26), (0, rear + 0.04, 0.46 + c), trim, bevel=0.04))
    parts.append(box((w * 0.82, 0.05, 0.09), (0, rear + 0.0, 0.8 + c), tail, bevel=0.02))
    parts.append(box((0.5, 0.02, 0.12), (0, rear - 0.05, 0.52 + c), plate))
    # выхлопные трубы
    for x in (-0.5, 0.5):
        parts.append(cyl(0.045, 0.1, (x, rear - 0.04, 0.36 + c), chrome, rot=(math.radians(90), 0, 0), verts=8))
    # зеркала
    for x in (-w / 2 - 0.04, w / 2 + 0.04):
        parts.append(box((0.14, 0.22, 0.11), (x, gl[0][0] - 0.2, gl[0][1] + 0.1), body, bevel=0.03))
    # антенна «плавник» на крыше
    if style != "super":
        parts.append(box((0.04, 0.2, 0.07), (0, gl[2][0] + 0.25, top + 0.06), black))
    if st["wing"]:
        # спойлер как у F40: две стойки и широкая плоскость
        for x in (-0.7, 0.7):
            parts.append(box((0.05, 0.12, 0.46), (x, rear + 0.2, 1.12), body))
        parts.append(box((1.84, 0.5, 0.05), (0, rear + 0.05, 1.36), body, bevel=0.01))
        parts.append(box((0.04, 0.5, 0.18), (-0.92, rear + 0.05, 1.3), body))
        parts.append(box((0.04, 0.5, 0.18), (0.92, rear + 0.05, 1.3), body))
    if extras:
        parts += extras(st, w, front, rear, c)
    o = join(parts, name)
    smooth(o)
    return o


def police_extras(st, w, front, rear, c):
    """Полицейский внедорожник: белые двери, мигалки на крыше, кенгурятник."""
    white = mat("police_white", "#e9ebef", 0.4)
    blue = mat("police_blue", "#2a4cff", 0.4, "#2a4cff", 4.0)
    red = mat("police_red", "#ff2a2a", 0.4, "#ff2a2a", 4.0)
    barm = mat("police_bar", "#0b0c0f", 0.5)
    chrome = mat("police_chrome", "#8f95a3", 0.4, metal=0.3)
    out = []
    # белые двери и боковые стойки
    out.append(box((w + 0.012, 1.55, 0.66), (0, 0.15, 0.82 + c * 0.2), white, bevel=0.02))
    out.append(box((w - 0.28, 1.62, 0.04), (0, 0.15, 1.2), white))
    # светодиодная балка на крыше
    top = max(p[1] for p in st["glass"])
    out.append(box((1.32, 0.36, 0.1), (0, 0.1, top + 0.1), barm, bevel=0.02))
    out.append(box((0.62, 0.34, 0.07), (-0.34, 0.1, top + 0.17), blue, bevel=0.01))
    out.append(box((0.62, 0.34, 0.07), (0.34, 0.1, top + 0.17), red, bevel=0.01))
    # мигалки в решётке и сзади
    out.append(box((0.5, 0.05, 0.06), (0, front + 0.02, 0.98 + c), blue))
    out.append(box((0.5, 0.05, 0.06), (0, rear - 0.02, 1.02 + c), red))
    # кенгурятник
    for x in (-0.7, 0.7):
        out.append(branch((x, front + 0.12, 0.45 + c), (x, front + 0.12, 1.0 + c), 0.04, 0.04, barm))
    out.append(branch((-0.7, front + 0.12, 0.98 + c), (0.7, front + 0.12, 0.98 + c), 0.04, 0.04, barm))
    out.append(branch((-0.7, front + 0.12, 0.62 + c), (0.7, front + 0.12, 0.62 + c), 0.04, 0.04, barm))
    out.append(box((0.04, 0.1, 0.1), (0, front + 0.06, 0.8 + c), chrome))
    return out


def van_extras(st, w, front, rear, c):
    """Фургон: круглые фары, хромированный бампер и решётка, оранжевые габариты."""
    chrome = mat("van_chrome", "#aeb4c2", 0.3, metal=0.35)
    lamp = mat("van_lamp", "#fff3d2", 0.3, "#fff3d2", 4.0)
    amber = mat("van_amber", "#ffa33a", 0.4, "#ff9a2a", 3.0)
    out = []
    for x in (-0.68, 0.68):
        out.append(cyl(0.13, 0.06, (x, front + 0.01, 0.86 + c), lamp, rot=(math.radians(90), 0, 0), verts=16))
        out.append(cyl(0.16, 0.04, (x, front - 0.01, 0.86 + c), chrome, rot=(math.radians(90), 0, 0), verts=16))
    out.append(box((0.9, 0.05, 0.22), (0, front + 0.02, 0.86 + c), chrome))
    for k in range(5):
        out.append(box((0.88, 0.02, 0.012), (0, front + 0.05, 0.78 + c + k * 0.04), mat("van_dark", "#17191d", 0.5)))
    out.append(box((w + 0.06, 0.16, 0.2), (0, front + 0.04, 0.48 + c), chrome, bevel=0.02))
    out.append(box((w + 0.06, 0.16, 0.2), (0, rear - 0.04, 0.48 + c), chrome, bevel=0.02))
    for x in (-0.95, 0.95):
        out.append(box((0.06, 0.12, 0.07), (x, front - 0.08, 1.0 + c), amber))
    return out


def build_props():
    clear()
    items = [tree(), tree_b(), bench(), bin_(), car("car_a", "#5b6372", "fastback"), car("car_b", "#b3202a", "super"), car("car_c", "#26344f", "suv"), car("car_d", "#14161b", "suv", police_extras), car("car_e", "#3f5e46", "van", van_extras)]
    for i, o in enumerate(items):
        o.location = (i * 6, 0, 0)
    export(os.path.join(OUT, "props.glb"), items)


# ─── Комната (координаты как в three.js, x/z → x/-y) ───────────────────────
def leaf(loc, length, width, yaw, pitch, m):
    """Лист-«лодочка»: сплюснутая сфера, основание в loc, наклон pitch от вертикали, поворот yaw."""
    bpy.ops.mesh.primitive_ico_sphere_add(radius=1, subdivisions=1, location=(0, 0, 0))
    o = bpy.context.active_object
    o.scale = (width, 0.03, length)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for v in o.data.vertices:
        v.co.z += length
    o.rotation_euler = (pitch, 0, yaw)
    o.location = loc
    return finish(o, m)


def flower(loc, stem_h, petal_m, center_m, stem_m, leaf_m, tilt=(0.0, 0.0)):
    """Цветок: стебель, пара листьев, венчик из 8 лепестков и серединка."""
    x, y, z = loc
    tx, ty = tilt
    top = (x + tx, y + ty, z + stem_h)
    out = [branch((x, y, z), top, 0.014, 0.01, stem_m)]
    out.append(leaf((x + tx * 0.4, y + ty * 0.4, z + stem_h * 0.35), 0.12, 0.035, 0.3, 1.0, leaf_m))
    out.append(leaf((x + tx * 0.5, y + ty * 0.5, z + stem_h * 0.5), 0.1, 0.03, 3.4, 1.0, leaf_m))
    for k in range(8):
        a = k * math.pi / 4
        out.append(leaf(top, 0.07, 0.03, a, 1.25, petal_m))
    out.append(ico(0.028, (top[0], top[1], top[2] + 0.012), center_m, sub=1))
    return out


def leafy_plant(base, pot_top, stem_m, leaf_ms, count=11, height=0.9, seed=1):
    """Комнатное растение: центральный ствол и листья по спирали, крупные снизу."""
    import random
    rnd = random.Random(seed)
    x, y, z = base
    out = [branch((x, y, z), (x, y, z + height), 0.035, 0.015, stem_m)]
    for k in range(count):
        t = k / (count - 1)
        yaw = k * 2.4 + rnd.random() * 0.4
        ln = 0.42 - 0.18 * t + rnd.random() * 0.06
        wd = ln * 0.55
        pz = z + 0.15 + height * (0.15 + 0.85 * t) * 0.9
        out.append(leaf((x, y, pz), ln, wd, yaw, 0.55 + 0.5 * (1 - t) + rnd.random() * 0.2, leaf_ms[k % len(leaf_ms)]))
    return out


import mathutils


def screen_quad(name, c, r, u, w, h, color):
    """Плоскость экрана с UV (в three на неё накладывается обои-текстура).
    r — вектор «вправо» со стороны зрителя, u — «вверх»; нормаль = r × u."""
    c, r, u = mathutils.Vector(c), mathutils.Vector(r), mathutils.Vector(u)
    vs = [c - r * w / 2 - u * h / 2, c + r * w / 2 - u * h / 2, c + r * w / 2 + u * h / 2, c - r * w / 2 + u * h / 2]
    me = bpy.data.meshes.new(name)
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    me.from_pydata([tuple(v) for v in vs], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UV")
    for li, (a, b) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (a, b)
    me.materials.append(mat(name + "_mat", color, 0.3, color, 1.5))
    return o


def laptop(cx, cy, zt, P, S):
    """Тонкий ноутбук с подсвеченной клавиатурой, тачпадом и экраном с обоями."""
    body = mat("lap_body", "#262932", 0.45, metal=0.3)
    lid = mat("lap_lid", "#0d0f15", 0.4, metal=0.3)
    glow = mat("kb_glow", "#2fe8d8", 0.5, "#2fe8d8", 3.0)
    keycap = mat("keycap", "#090b10", 0.6)
    pad = mat("trackpad", "#2a2d37", 0.5)
    bz = zt + 0.009
    P.append(box((0.84, 0.58, 0.018), (cx, cy, bz), body, bevel=0.006))
    kz = zt + 0.0185
    P.append(box((0.72, 0.25, 0.002), (cx, cy + 0.07, kz), glow))
    for r in range(5):
        y = cy + 0.17 - r * 0.047
        if r < 4:
            for c in range(13):
                P.append(box((0.043, 0.038, 0.007), (cx - 0.31 + c * 0.0517, y, kz + 0.004), keycap))
        else:
            for c in list(range(0, 3)) + list(range(10, 13)):
                P.append(box((0.043, 0.038, 0.007), (cx - 0.31 + c * 0.0517, y, kz + 0.004), keycap))
            P.append(box((0.3, 0.038, 0.007), (cx, y, kz + 0.004), keycap))
    P.append(box((0.3, 0.17, 0.002), (cx, cy - 0.185, kz), glow))
    P.append(box((0.28, 0.15, 0.004), (cx, cy - 0.185, kz + 0.002), pad))
    A = math.radians(12)
    h = 0.54
    yh, zh = cy + 0.29, zt + 0.018
    centre = mathutils.Vector((cx, yh + (h / 2) * math.sin(A), zh + (h / 2) * math.cos(A)))
    back = mathutils.Vector((0, math.cos(A), -math.sin(A)))
    front = -back
    P.append(box((0.84, 0.014, h), tuple(centre + back * 0.007), lid, rot=(-A, 0, 0), bevel=0.004))
    S.append(screen_quad("laptop_screen", centre + front * 0.0005, (1, 0, 0), (0, math.sin(A), math.cos(A)), 0.79, 0.49, "#4d9dff"))


def spiral_stem(base, height, turns, rad, m, seed=0, segs=22):
    """Декоративный «закрученный» стебель (бамбук-спираль) из коротких отрезков."""
    import random
    rnd = random.Random(seed)
    ph = rnd.random() * 6.28
    pts = []
    for k in range(segs + 1):
        t = k / segs
        a = ph + t * turns * 6.283
        r = rad * (0.4 + 0.9 * t)
        pts.append((base[0] + math.cos(a) * r, base[1] + math.sin(a) * r, base[2] + t * height))
    return [branch(pts[i], pts[i + 1], 0.011, 0.011, m) for i in range(segs)]


def cone(r1, r2, depth, loc, m, verts=16):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc)
    return finish(bpy.context.active_object, m)


def tv_corner(P, S, wood):
    """Телевизор на правой стене (x=4): тумба и две вазы со спиральными стеблями."""
    blackm = mat("tv_black", "#08090d", 0.35, metal=0.2)
    cab = mat("tv_cabinet", "#14161c", 0.45, metal=0.2)
    vase = mat("vase", "#23262c", 0.35, metal=0.35)
    stem = mat("curl_stem", "#2f5a2a", 0.6)
    yc = 1.4  # центр по y (blender) = three z -1.4
    P.append(box((0.5, 2.4, 0.5), (3.72, yc, 0.25), cab, bevel=0.01))
    for yy in (yc - 0.6, yc + 0.6):
        P.append(box((0.01, 1.1, 0.4), (3.465, yy, 0.25), mat("cab_door", "#1c1f27", 0.5)))
    P.append(box((0.04, 1.62, 0.95), (3.955, yc, 1.6), blackm, bevel=0.01))
    S.append(screen_quad("tv_screen", (3.934, yc, 1.6), (0, -1, 0), (0, 0, 1), 1.54, 0.87, "#7fc3d0"))
    # часы над телевизором (ось — по x, циферблат смотрит в комнату)
    gold_c = mat("clock_frame", "#caa86a", 0.4, metal=0.3)
    zc = 2.55
    P.append(cyl(0.24, 0.05, (3.95, yc, zc), gold_c, rot=(0, math.radians(90), 0), verts=32))
    P.append(cyl(0.21, 0.052, (3.947, yc, zc), mat("clock_face", "#f1ecdd", 0.7), rot=(0, math.radians(90), 0), verts=32))
    hands = mat("clock_hand", "#15171c", 0.5)
    P.append(box((0.012, 0.012, 0.15), (3.918, yc, zc + 0.075), hands))
    P.append(box((0.012, 0.11, 0.012), (3.912, yc - 0.055, zc), hands))
    for k in range(12):
        ang = k * math.pi / 6
        P.append(box((0.01, 0.012, 0.028), (3.93, yc - math.sin(ang) * 0.18, zc + math.cos(ang) * 0.18), hands, rot=(ang, 0, 0)))
    for sgn in (-1, 1):
        yy = yc + sgn * 1.05
        P.append(cone(0.12, 0.09, 0.5, (3.72, yy, 0.8), vase))
        P.append(cone(0.09, 0.115, 0.08, (3.72, yy, 1.09), vase))
        for k in range(3):
            P += spiral_stem((3.72 + (k - 1) * 0.015, yy + (k - 1) * 0.02, 1.05), 0.75 + k * 0.1, 2.5 + k * 0.6, 0.07 + k * 0.02, stem, seed=k + 5 * (sgn + 2))


def pc_desk(P, S):
    """Чёрный стол с тумбой, монитором, системным блоком с RGB-кольцами, лампой и креслом."""
    deskm = mat("pc_desk", "#0c0d11", 0.4, metal=0.2)
    edge = mat("pc_edge", "#17191f", 0.4)
    blackm = mat("pc_black", "#07080b", 0.35, metal=0.2)
    chrome = mat("pc_chrome", "#9aa0ac", 0.3, metal=0.5)
    seatm = mat("office_seat", "#15161a", 0.7)
    cx, cy = 3.5, -1.9
    P.append(box((0.66, 1.34, 0.045), (cx, cy, 0.74), deskm, bevel=0.01))
    P.append(box((0.6, 0.42, 0.7), (cx, cy + 0.45, 0.35), deskm, bevel=0.01))
    for z in (0.52, 0.34, 0.16):
        P.append(box((0.01, 0.38, 0.015), (cx - 0.305, cy + 0.45, z), edge))
    P.append(box((0.6, 0.03, 0.72), (cx, cy - 0.64, 0.36), deskm))
    P.append(box((0.04, 0.66, 0.3), (cx + 0.27, cy - 0.05, 0.5), edge))
    # монитор
    P.append(box((0.2, 0.26, 0.015), (cx + 0.05, cy + 0.12, 0.772), blackm, bevel=0.005))
    P.append(box((0.03, 0.04, 0.22), (cx + 0.05, cy + 0.12, 0.88), blackm))
    P.append(box((0.026, 0.8, 0.49), (cx + 0.05, cy + 0.12, 1.12), blackm, bevel=0.006))
    S.append(screen_quad("pc_screen", (cx + 0.05 - 0.0135, cy + 0.12, 1.12), (0, -1, 0), (0, 0, 1), 0.77, 0.45, "#e0782a"))
    # системный блок: передняя панель (к креслу) — три RGB-кольца
    tx, ty = cx + 0.05, cy - 0.38
    P.append(box((0.45, 0.21, 0.5), (tx, ty, 1.0), blackm, bevel=0.008))
    rgb = [("#ff2a6d", 1.6), ("#2dff7a", 1.6), ("#2a8cff", 1.8)]
    for k, (col, st) in enumerate(rgb):
        z = 0.82 + k * 0.17
        bpy.ops.mesh.primitive_torus_add(major_radius=0.062, minor_radius=0.011, major_segments=20, minor_segments=6, location=(tx - 0.228, ty, z), rotation=(0, math.radians(90), 0))
        P.append(finish(bpy.context.active_object, mat("rgb" + str(k), col, 0.4, col, st)))
        P.append(cyl(0.05, 0.004, (tx - 0.226, ty, z), mat("fan_dark", "#14151b", 0.5), rot=(0, math.radians(90), 0), verts=14))
    # клавиатура и мышь
    P.append(box((0.17, 0.44, 0.014), (cx - 0.12, cy + 0.12, 0.77), mat("pc_kb", "#1d1f26", 0.5), bevel=0.004))
    P.append(box((0.06, 0.04, 0.018), (cx - 0.12, cy + 0.42, 0.775), mat("pc_kb", "#1d1f26", 0.5), bevel=0.01))
    # настольная лампа-«гусь» с жёлтым светом
    P.append(cyl(0.06, 0.015, (cx + 0.18, cy + 0.6, 0.77), blackm, verts=12))
    P.append(branch((cx + 0.18, cy + 0.6, 0.77), (cx + 0.12, cy + 0.55, 1.05), 0.012, 0.012, blackm))
    P.append(branch((cx + 0.12, cy + 0.55, 1.05), (cx + 0.05, cy + 0.42, 1.14), 0.012, 0.012, blackm))
    P.append(cone(0.075, 0.025, 0.1, (cx + 0.03, cy + 0.4, 1.12), chrome, verts=14))
    P.append(ico(0.03, (cx + 0.03, cy + 0.4, 1.09), mat("pc_bulb", "#ffd84a", 0.4, "#ffd84a", 8.0), sub=1))
    # кресло: хромированный каркас-«салазки», сиденье и спинка
    ox, oy = cx - 0.95, cy
    P.append(box((0.5, 0.5, 0.08), (ox, oy, 0.47), seatm, bevel=0.02))
    P.append(box((0.07, 0.48, 0.52), (ox - 0.28, oy, 0.8), seatm, rot=(0, math.radians(-8), 0), bevel=0.02))
    for sy in (-0.24, 0.24):
        P.append(branch((ox + 0.25, oy + sy, 0.08), (ox + 0.25, oy + sy, 0.43), 0.012, 0.012, chrome))
        P.append(branch((ox - 0.25, oy + sy, 0.08), (ox - 0.25, oy + sy, 0.43), 0.012, 0.012, chrome))
        P.append(branch((ox - 0.25, oy + sy, 0.08), (ox + 0.3, oy + sy, 0.08), 0.012, 0.012, chrome))
        P.append(branch((ox - 0.2, oy + sy, 0.43), (ox - 0.25, oy + sy, 0.75), 0.011, 0.011, chrome))
        P.append(branch((ox - 0.2, oy + sy, 0.62), (ox + 0.2, oy + sy, 0.62), 0.012, 0.012, chrome))


def wall_art(P, S, frame_m):
    """Задняя стена (y=4): картины, часы над окном."""
    colors = [("#e9b44c", "#2f5d8a", "#c9503a"), ("#2f8f83", "#f2e3c6", "#d17b7b")]
    # две картины справа от окна
    for (px, pz, w, h, pal) in [(3.25, 2.55, 0.8, 1.05, 0), (3.25, 1.25, 1.0, 0.7, 1)]:
        P.append(box((w + 0.1, 0.04, h + 0.1), (px, 3.97, pz), frame_m, bevel=0.01))
        P.append(box((w, 0.045, h), (px, 3.955, pz), mat("canvas", "#f4efe3", 0.9)))
        c1, c2, c3 = colors[pal]
        P.append(box((w * 0.8, 0.05, h * 0.38), (px, 3.95, pz + h * 0.22), mat("art_a" + str(pal), c1, 0.8)))
        P.append(box((w * 0.5, 0.05, h * 0.32), (px - w * 0.15, 3.95, pz - h * 0.2), mat("art_b" + str(pal), c2, 0.8)))
        P.append(cyl(h * 0.14, 0.05, (px + w * 0.2, 3.95, pz - h * 0.18), mat("art_c" + str(pal), c3, 0.8), rot=(math.radians(90), 0, 0), verts=18))
    # маленькая рамка над шкафом
    P.append(box((0.8, 0.04, 0.55), (-3.1, 3.97, 3.25), frame_m, bevel=0.01))
    P.append(box((0.72, 0.045, 0.47), (-3.1, 3.955, 3.25), mat("art_sea", "#1f4b6e", 0.8)))
    P.append(box((0.72, 0.05, 0.16), (-3.1, 3.95, 3.12), mat("art_sand", "#e6c486", 0.8)))


def curtain_panel(cx, ymid, w0, h, ztop, seed):
    """Драпированная штора: складки, сборка у подхвата, зубчатый подол, рисунок вершинными цветами."""
    import bmesh
    nx, nz = 22, 14
    me = bpy.data.meshes.new("curtain")
    o = bpy.data.objects.new("curtain", me)
    bpy.context.collection.objects.link(o)
    bm = bmesh.new()
    meta = []
    rows = []
    for j in range(nz + 1):
        t = j / nz
        if t < 0.5:
            wf = 1.0
        elif t < 0.62:
            wf = 1.0 - (t - 0.5) / 0.12 * 0.45
        else:
            wf = 0.55 + (t - 0.62) / 0.38 * 0.4
        w = w0 * wf
        row = []
        for i in range(nx + 1):
            u = i / nx - 0.5
            ph = u * 2 * math.pi * 5 + seed + t * 0.8
            amp = 0.05 * (0.6 + 0.9 * (1 - wf) + 0.4 * t)
            x = cx + u * w + 0.04 * math.sin(t * 4 + seed)
            y = ymid + math.sin(ph) * amp
            z = ztop - t * h
            if j == nz:
                z += 0.035 * (1 if i % 2 else -1)
            row.append(bm.verts.new((x, y, z)))
            meta.append((u, t, ph, x, z))
        rows.append(row)
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    base = hex_rgba("#b0481f")
    for li, loop in enumerate(me.loops):
        u, t, ph, x, z = meta[loop.vertex_index]
        shade = 0.72 + 0.34 * (0.5 + 0.5 * math.sin(ph))
        pat = 0.9 + 0.1 * math.sin(x * 22) * math.sin(z * 22)
        k = shade * pat
        attr.data[li].color = (base[0] * k, base[1] * k * 0.95, base[2] * k, 1.0)
    m = bpy.data.materials.new("curtain_mat")
    m.use_nodes = True
    m.use_backface_culling = False
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    cn = nt.nodes.new("ShaderNodeVertexColor")
    cn.layer_name = "Col"
    nt.links.new(cn.outputs["Color"], bsdf.inputs["Base Color"])
    me.materials.append(m)
    return o


def curtains(P):
    bronze = mat("rod_bronze", "#8a5a2b", 0.4, metal=0.35)
    gold = mat("tieback", "#e8c84a", 0.5)
    ry, rz = 3.86, 3.56
    P.append(cyl(0.022, 5.9, (0, ry, rz), bronze, rot=(0, math.radians(90), 0), verts=10))
    for sx in (-1, 1):
        P.append(ico(0.065, (sx * 2.98, ry, rz), bronze, sub=2))
        P.append(cyl(0.035, 0.05, (sx * 2.88, ry, rz), bronze, rot=(0, math.radians(90), 0), verts=10))
        cx = sx * 2.2
        P.append(curtain_panel(cx, 3.72, 1.0, 3.42, rz - 0.04, 0.7 + sx))
        # подхват-лента
        P.append(box((0.52, 0.16, 0.05), (cx, 3.72, rz - 0.04 - 3.42 * 0.62), gold, rot=(0, sx * 0.08, 0), bevel=0.01))
        # кольца на карнизе
        for k in range(6):
            P.append(cyl(0.035, 0.012, (cx - 0.4 + k * 0.16, ry, rz - 0.03), bronze, rot=(0, 0, 0), verts=10))


def build_room():
    clear()
    wood = mat("desk_wood", "#7a5238", 0.7)
    dark_wood = mat("shelf_wood", "#4c3526", 0.75)
    fabric = mat("chair_fabric", "#34426f", 0.9)
    metal = mat("laptop_body", "#a0a8bd", 0.4, metal=0.7)
    screen = mat("screen", "#4d9dff", 0.3, "#4d9dff", 2.2)
    black = mat("black", "#101219", 0.6)
    lamp_shade = mat("lamp_shade", "#ffcf8a", 0.5, "#ffb866", 5.0)
    rug = mat("rug", "#7a3b4e", 0.95)
    curtain = mat("curtain", "#8a3d52", 0.95)
    pot = mat("pot", "#c46a4a", 0.8)
    leaves = mat("plant_leaves", "#3d8f5a", 0.8)
    frame = mat("frame", "#caa86a", 0.4, metal=0.5)
    art = mat("art", "#2a4a7a", 0.8, "#2a4a7a", 0.4)
    book_cols = ["#b5483a", "#3a6bb5", "#d6a93a", "#4a9a6a", "#8a5ab5", "#c9c4b4"]
    paper = mat("paper", "#e8e2d0", 0.9)
    mug = mat("mug", "#e9e4d6", 0.5)

    P = []
    # стол: верх + ножки (центр three (0,0.75,-1.5) → blender (0,1.5,0.75))
    P.append(box((2.0, 1.0, 0.07), (0, 1.5, 0.75), wood, bevel=0.01))
    for x in (-0.92, 0.92):
        for y in (1.1, 1.9):
            P.append(box((0.06, 0.06, 0.74), (x, y, 0.37), dark_wood))
    P.append(box((1.84, 0.04, 0.3), (0, 1.9, 0.52), dark_wood))  # царга
    S = []
    laptop(0.0, 1.45, 0.785, P, S)
    # лампа на столе справа
    P.append(cyl(0.11, 0.03, (0.78, 1.8, 0.8), black))
    P.append(cyl(0.015, 0.5, (0.78, 1.8, 1.05), black, verts=6))
    P.append(cyl(0.12, 0.14, (0.78, 1.72, 1.34), lamp_shade, rot=(math.radians(25), 0, 0), verts=10))
    # кружка и бумаги
    P.append(cyl(0.05, 0.1, (-0.7, 1.35, 0.84), mug, verts=10))
    P.append(box((0.3, 0.4, 0.01), (-0.55, 1.65, 0.79), paper, rot=(0, 0, math.radians(14))))
    # стул
    P.append(box((0.52, 0.5, 0.07), (0, 0.55, 0.47), fabric, bevel=0.02))
    P.append(box((0.52, 0.07, 0.5), (0, 0.32, 0.78), fabric, bevel=0.02))
    P.append(cyl(0.035, 0.45, (0, 0.55, 0.22), black, verts=6))
    P.append(cyl(0.25, 0.04, (0, 0.55, 0.03), black, verts=5))
    # ковёр
    P.append(box((3.4, 2.6, 0.012), (0, 0.9, 0.007), rug, bevel=0.003))
    # книжный шкаф у левой стены (x=-3.8)
    P.append(box((0.35, 2.4, 2.2), (-3.8, 0.2, 1.1), dark_wood))
    for z in (0.5, 1.1, 1.7):
        P.append(box((0.4, 2.35, 0.04), (-3.77, 0.2, z), wood))
    import random
    random.seed(4)
    for z0 in (0.54, 1.14, 1.74):
        y = -0.9
        while y < 1.2:
            w = 0.05 + random.random() * 0.05
            h = 0.28 + random.random() * 0.12
            P.append(box((0.24, w, h), (-3.75, y, z0 + h / 2), mat("book", random.choice(book_cols), 0.8)))
            y += w + 0.012
    # второй шкаф — у задней стены слева от окна (виден сразу при входе)
    P.append(box((1.5, 0.35, 2.3), (-3.1, 3.82, 1.15), dark_wood))
    for z in (0.5, 1.1, 1.7):
        P.append(box((1.45, 0.38, 0.04), (-3.1, 3.8, z), wood))
    for z0 in (0.54, 1.14, 1.74):
        x = -3.78
        while x < -2.45:
            w = 0.05 + random.random() * 0.05
            h = 0.27 + random.random() * 0.13
            P.append(box((w, 0.24, h), (x, 3.7, z0 + h / 2), mat("book", random.choice(book_cols), 0.8)))
            x += w + 0.012
    # люстра: цепь, розетка, кольцо, шесть рожков с лампами, подвеска
    gold = mat("gold", "#b8923a", 0.35, metal=0.9)
    bulb = mat("bulb", "#ffe3a8", 0.4, "#ffcf7a", 7.0)
    cx, cy = 0.0, 1.5  # blender (x, y) = three (x, -z)
    P.append(cyl(0.14, 0.04, (cx, cy, 3.98), gold, verts=16))
    P.append(cyl(0.012, 0.6, (cx, cy, 3.66), gold, verts=6))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.025, major_segments=24, minor_segments=8, location=(cx, cy, 3.36))
    P.append(finish(bpy.context.active_object, gold))
    for k in range(6):
        ang = k * math.pi / 3
        ax, ay = cx + math.cos(ang) * 0.36, cy + math.sin(ang) * 0.36
        P.append(cyl(0.012, 0.22, (ax, ay, 3.46), gold, verts=6))
        P.append(cyl(0.035, 0.05, (ax, ay, 3.57), gold, verts=8))
        P.append(ico(0.045, (ax, ay, 3.64), bulb, sub=1, squash=1.5))
        # хрустальная подвеска
        P.append(ico(0.025, (cx + math.cos(ang + 0.5) * 0.3, cy + math.sin(ang + 0.5) * 0.3, 3.28), mat("crystal", "#cfe6ff", 0.1, "#9cc8ff", 0.8), sub=1))
    P.append(cyl(0.012, 0.18, (cx, cy, 3.25), gold, verts=6))
    P.append(ico(0.07, (cx, cy, 3.12), bulb, sub=1))
    # растение в углу справа: кадка и пышная крона из листьев
    leaves2 = mat("plant_leaves2", "#2f7a4c", 0.7)
    leaves3 = mat("plant_leaves3", "#4a9a5c", 0.7)
    stemg = mat("stem", "#3a5a34", 0.8)
    P.append(cyl(0.27, 0.45, (3.3, 3.3, 0.225), pot, verts=14))
    P.append(cyl(0.285, 0.05, (3.3, 3.3, 0.45), mat("pot_rim", "#a95537", 0.8), verts=14))
    P.append(cyl(0.25, 0.03, (3.3, 3.3, 0.47), mat("soil", "#2a1f18", 1.0), verts=14))
    P += leafy_plant((3.3, 3.3, 0.47), 0.47, stemg, [leaves, leaves2, leaves3], count=14, height=1.1, seed=3)
    P += leafy_plant((3.22, 3.36, 0.47), 0.47, stemg, [leaves2, leaves3], count=8, height=0.7, seed=9)
    tv_corner(P, S, wood)
    pc_desk(P, S)
    wall_art(P, S, frame)
    # подоконник и рама окна (проём x±1.6, y 0.9..3.4, стена z=-4 → y=+4)
    P.append(box((3.7, 0.32, 0.07), (0, 3.9, 0.88), wood))
    P.append(box((3.5, 0.1, 0.1), (0, 3.97, 3.45), dark_wood))
    P.append(box((0.1, 0.1, 2.6), (-1.65, 3.97, 2.15), dark_wood))
    P.append(box((0.1, 0.1, 2.6), (1.65, 3.97, 2.15), dark_wood))
    curtains(P)
    # горшок с цветами на подоконнике
    petal = mat("petal", "#f4b6cf", 0.6)
    petal2 = mat("petal2", "#fff3d6", 0.6)
    ycen = mat("flower_center", "#e8b43a", 0.6)
    P.append(cyl(0.11, 0.17, (-1.2, 3.9, 1.0), pot, verts=12))
    P.append(cyl(0.12, 0.03, (-1.2, 3.9, 1.09), mat("pot_rim", "#a95537", 0.8), verts=12))
    P += flower((-1.2, 3.9, 1.1), 0.34, petal, ycen, stemg, leaves, tilt=(-0.03, 0.04))
    P += flower((-1.17, 3.93, 1.1), 0.44, petal2, ycen, stemg, leaves2, tilt=(0.05, -0.02))
    P += flower((-1.23, 3.87, 1.1), 0.28, petal, ycen, stemg, leaves, tilt=(-0.06, -0.03))
    P += flower((-1.2, 3.9, 1.1), 0.5, petal2, ycen, stemg, leaves3, tilt=(0.0, 0.07))

    room = join(P, "room_props")
    export(os.path.join(OUT, "room.glb"), [room] + S)


build_props()
build_room()
