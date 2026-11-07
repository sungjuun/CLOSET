alter table public.member_body_measurements
  add column outerwear_length_cm numeric check (outerwear_length_cm between 1 and 300 and outerwear_length_cm = round(outerwear_length_cm, 1)),
  add column outerwear_shoulder_width_cm numeric check (outerwear_shoulder_width_cm between 1 and 300 and outerwear_shoulder_width_cm = round(outerwear_shoulder_width_cm, 1)),
  add column outerwear_chest_width_cm numeric check (outerwear_chest_width_cm between 1 and 300 and outerwear_chest_width_cm = round(outerwear_chest_width_cm, 1)),
  add column outerwear_sleeve_length_cm numeric check (outerwear_sleeve_length_cm between 1 and 300 and outerwear_sleeve_length_cm = round(outerwear_sleeve_length_cm, 1)),
  add column top_length_cm numeric check (top_length_cm between 1 and 300 and top_length_cm = round(top_length_cm, 1)),
  add column top_shoulder_width_cm numeric check (top_shoulder_width_cm between 1 and 300 and top_shoulder_width_cm = round(top_shoulder_width_cm, 1)),
  add column top_chest_width_cm numeric check (top_chest_width_cm between 1 and 300 and top_chest_width_cm = round(top_chest_width_cm, 1)),
  add column top_sleeve_length_cm numeric check (top_sleeve_length_cm between 1 and 300 and top_sleeve_length_cm = round(top_sleeve_length_cm, 1)),
  add column bottom_length_cm numeric check (bottom_length_cm between 1 and 300 and bottom_length_cm = round(bottom_length_cm, 1)),
  add column bottom_waist_width_cm numeric check (bottom_waist_width_cm between 1 and 300 and bottom_waist_width_cm = round(bottom_waist_width_cm, 1)),
  add column bottom_hip_width_cm numeric check (bottom_hip_width_cm between 1 and 300 and bottom_hip_width_cm = round(bottom_hip_width_cm, 1)),
  add column bottom_thigh_width_cm numeric check (bottom_thigh_width_cm between 1 and 300 and bottom_thigh_width_cm = round(bottom_thigh_width_cm, 1)),
  add column bottom_rise_cm numeric check (bottom_rise_cm between 1 and 300 and bottom_rise_cm = round(bottom_rise_cm, 1)),
  add column bottom_hem_width_cm numeric check (bottom_hem_width_cm between 1 and 300 and bottom_hem_width_cm = round(bottom_hem_width_cm, 1));

grant insert (
  outerwear_length_cm, outerwear_shoulder_width_cm, outerwear_chest_width_cm, outerwear_sleeve_length_cm,
  top_length_cm, top_shoulder_width_cm, top_chest_width_cm, top_sleeve_length_cm,
  bottom_length_cm, bottom_waist_width_cm, bottom_hip_width_cm, bottom_thigh_width_cm, bottom_rise_cm, bottom_hem_width_cm
), update (
  outerwear_length_cm, outerwear_shoulder_width_cm, outerwear_chest_width_cm, outerwear_sleeve_length_cm,
  top_length_cm, top_shoulder_width_cm, top_chest_width_cm, top_sleeve_length_cm,
  bottom_length_cm, bottom_waist_width_cm, bottom_hip_width_cm, bottom_thigh_width_cm, bottom_rise_cm, bottom_hem_width_cm
) on public.member_body_measurements to authenticated;
