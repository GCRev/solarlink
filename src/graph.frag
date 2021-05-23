#version 310 es
precision highp float;

uniform int u_draw_step;
uniform ivec2 u_window_size;
in float a_frag_alpha;
in vec3 a_frag_color;
out vec4 outColor;

void main() {
  outColor = vec4(a_frag_color, a_frag_alpha);
}
