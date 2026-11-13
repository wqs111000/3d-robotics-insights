import runpy,json
v=runpy.run_path('tools/prepare-observation-sources.py')
v['ALLOWED'].add('media.githubusercontent.com')
r=v['work']('gsplat-paper','https://arxiv.org/html/2409.06765v2')
urls={'nvblox-nodegraph':'https://media.githubusercontent.com/media/NVIDIA-ISAAC-ROS/.github/release-5.0/resources/isaac_ros_docs/repositories_and_packages/isaac_ros_nvblox/isaac_ros_nvblox_nodegraph.png/','openfly-method':'https://arxiv.org/html/2610.39287v1/OpenFlyV2_Fig1_v3.png','rover-detection':'https://arxiv.org/html/2611.08100v1/Pictures/detection_result.png','rover-platform':'https://arxiv.org/html/2611.08100v1/Pictures/CIRC2025_1-Photoroom.png'}
for k,u in urls.items():
 try:
  b,t=v['get'](u);(v['ROOT']/(k+'.png')).write_bytes(b);print('extra',k,len(b))
 except Exception as e:print('extra error',k,e)
