#version 310 es
precision mediump int;

in vec4 a_position;
in vec3 a_color;
in float a_alpha; 
uniform mat4 u_view;
out float a_frag_alpha;
out vec3 a_frag_color;

void main() {
  a_frag_alpha = a_alpha;
  a_frag_color = a_color;

  gl_Position = inverse(u_view) * a_position;
}
