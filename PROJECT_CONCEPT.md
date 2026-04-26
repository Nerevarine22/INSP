# Project Concept: SpecSight AR (Virtual Try-On for Instagram Commerce)

## 1. Executive Summary

SpecSight AR is a lightweight WebAR service for Instagram eyewear stores. The product lets customers try on glasses in real time through Instagram's in-app browser without leaving the social network. The main focus is maximum loading speed, working with 2D assets (product photos), and soft recommendations based on face shape.

## 2. Technical Stack

- Core Engine: Jeeliz FaceFilter (neural network for face tracking via WebGL)
- Framework: Vite + Preact (minimal bundle size)
- Rendering: Three.js (to place 2D layers in 3D space with proper perspective)
- Backend/Storage: Supabase (DB, Auth, Storage) + Cloudinary (automatic background removal from glasses photos)

## 3. Core Features (MVP)

- Instant WebAR: camera launch without installing apps, compatible with in-app browsers
- Pseudo-3D Projection: overlay a 2D glasses image on the face and transform it using Yaw/Pitch/Roll
- Smart Stylist Assistant: analyze face proportions to mark suggested frames with a "Recommended" label
- Instagram Integration: "Order in Direct" button that returns the customer to the shop chat with the selected model name

## 4. User Flow

1. The user opens `tryon.io/[slug]/[model_id]`.
2. `JeelizFaceFilter` initializes the camera.
3. The service loads a transparent `.png` image of the glasses.
4. A transformation matrix from Three.js anchors the glasses to the nose bridge and follows head tilt and rotation.
5. The user switches between models using a bottom swiper.

## 5. Instructions for AI Agent

Help implement a prototype based on Jeeliz FaceFilter.

Task 1: Set up a Vite project with Jeeliz that starts the camera and detects a face.

Task 2: Create logic to overlay a 2D glasses texture on the face mesh. The texture should follow the nose bridge and adjust perspective when the head turns.

Task 3: Add a function that analyzes the distance between the cheekbones and jaw to estimate face type (round/square) and output a text recommendation.

The code should be optimized for mobile browsers with low CPU/RAM usage.

## 6. Key Technical Challenges

- Perspective Correction: calculate 2D image deformation so the glasses do not look flat during head rotation
- Lighting Match: add a dynamic glare layer over the glasses

## 7. Product Notes

- This repository is the working prototype for the SpecSight AR concept.
- Prioritize mobile web performance and Instagram in-app browser compatibility.
- Prefer lightweight implementations and 2D asset workflows over heavy 3D pipelines for the MVP.
