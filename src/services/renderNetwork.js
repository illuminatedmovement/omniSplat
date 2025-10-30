// src/services/renderNetwork.js
import axios from 'axios';

// Render Network configuration
const RENDER_CONFIG = {
  API_BASE_URL: 'https://api.rendernetwork.com/v1',
  SUPPORTED_FORMATS: ['jpg', 'png', 'mp4'],
  MAX_BATCH_SIZE: 50,
  PROCESSING_TYPES: {
    GAUSSIAN_SPLATTING: 'gaussian_splatting',
    CONVEX_SPLATTING: 'convex_splatting',
    PHOTOGRAMMETRY: 'photogrammetry'
  }
};

class RenderNetworkService {
  constructor( ) {
    this.apiKey = null;
    this.nodeId = null;
    this.jobQueue = [];
  }

  // Initialize connection to Render Network
  async initialize(apiKey) {
    try {
      this.apiKey = apiKey;
      
      // Test connection to Render Network
      const response = await axios.get(`${RENDER_CONFIG.API_BASE_URL}/status`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Render Network connected:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Render Network connection failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Submit georeferenced photos for 3D reconstruction
  async submitReconstructionJob(photos, videos, sessionMetadata) {
    try {
      // Prepare job payload with georeferenced data
      const jobPayload = {
        jobType: 'spatial_reconstruction',
        processingTypes: [
          RENDER_CONFIG.PROCESSING_TYPES.GAUSSIAN_SPLATTING,
          RENDER_CONFIG.PROCESSING_TYPES.CONVEX_SPLATTING
        ],
        assets: {
          photos: photos.map(photo => ({
            uri: photo.uri,
            timestamp: photo.timestamp,
            gpsData: photo.gpsData,
            surveyMetadata: photo.surveyMetadata,
            index: photo.index
          })),
          videos: videos.map(video => ({
            uri: video.uri,
            timestamp: video.timestamp,
            duration: video.duration,
            gpsData: video.gpsData,
            surveyMetadata: video.surveyMetadata
          }))
        },
        sessionMetadata: {
          sessionId: sessionMetadata.sessionId,
          baseLocation: sessionMetadata.baseLocation,
          totalAssets: sessionMetadata.totalAssets,
          coordinateSystem: 'WGS84',
          isRTKSurvey: sessionMetadata.isRTKSurvey
        },
        outputFormats: ['ply', 'splat', 'obj', 'gltf'],
        quality: 'high',
        priority: 'normal'
      };

      // Submit to Render Network
      const response = await axios.post(
        `${RENDER_CONFIG.API_BASE_URL}/jobs/submit`,
        jobPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const jobId = response.data.jobId;
      this.jobQueue.push(jobId);

      return {
        success: true,
        jobId: jobId,
        estimatedTime: response.data.estimatedTime,
        cost: response.data.cost
      };

    } catch (error) {
      console.error('Job submission failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Check job status and progress
  async checkJobStatus(jobId) {
    try {
      const response = await axios.get(
        `${RENDER_CONFIG.API_BASE_URL}/jobs/${jobId}/status`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        status: response.data.status,
        progress: response.data.progress,
        estimatedTimeRemaining: response.data.estimatedTimeRemaining,
        currentStage: response.data.currentStage
      };

    } catch (error) {
      console.error('Status check failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Get completed job results
  async getJobResults(jobId) {
    try {
      const response = await axios.get(
        `${RENDER_CONFIG.API_BASE_URL}/jobs/${jobId}/results`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        results: {
          gaussianSplatting: {
            modelUrl: response.data.outputs.gaussian_splatting.url,
            modelHash: response.data.outputs.gaussian_splatting.hash,
            pointCount: response.data.outputs.gaussian_splatting.pointCount,
            fileSize: response.data.outputs.gaussian_splatting.fileSize
          },
          convexSplatting: {
            modelUrl: response.data.outputs.convex_splatting.url,
            modelHash: response.data.outputs.convex_splatting.hash,
            pointCount: response.data.outputs.convex_splatting.pointCount,
            fileSize: response.data.outputs.convex_splatting.fileSize
          },
          metadata: {
            processingTime: response.data.processingTime,
            renderNodes: response.data.renderNodes,
            qualityScore: response.data.qualityScore,
            geoReferenced: true
          }
        }
      };

    } catch (error) {
      console.error('Results retrieval failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Upload assets to Render Network storage
  async uploadAssets(assets) {
    try {
      const uploadPromises = assets.map(async (asset, index) => {
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          type: asset.type || 'image/jpeg',
          name: `asset_${index}.jpg`
        });
        formData.append('metadata', JSON.stringify({
          gpsData: asset.gpsData,
          timestamp: asset.timestamp,
          index: asset.index
        }));

        const response = await axios.post(
          `${RENDER_CONFIG.API_BASE_URL}/upload`,
          formData,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'multipart/form-data'
            }
          }
        );

        return {
          originalUri: asset.uri,
          renderNetworkUri: response.data.uri,
          uploadId: response.data.uploadId
        };
      });

      const uploadResults = await Promise.all(uploadPromises);
      
      return {
        success: true,
        uploads: uploadResults
      };

    } catch (error) {
      console.error('Asset upload failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Get available render nodes and pricing
  async getNetworkInfo() {
    try {
      const response = await axios.get(
        `${RENDER_CONFIG.API_BASE_URL}/network/info`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      return {
        success: true,
        networkInfo: {
          availableNodes: response.data.availableNodes,
          averageProcessingTime: response.data.averageProcessingTime,
          currentPricing: response.data.pricing,
          queueLength: response.data.queueLength
        }
      };

    } catch (error) {
      console.error('Network info retrieval failed:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new RenderNetworkService();
