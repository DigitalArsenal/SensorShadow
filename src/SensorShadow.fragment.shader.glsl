export default `
#define USE_NORMAL_SHADING
uniform float view_distance; // Maximum distance for shadow effect
uniform vec3 viewArea_color; // Color for visible areas
uniform vec3 shadowArea_color; // Color for invisible areas
uniform float percentShade; // Mix number for color blending
uniform sampler2D colorTexture; // Texture for color
uniform sampler2D shadowMap; // Shadow map texture
uniform sampler2D depthTexture; // Depth texture
uniform mat4 shadowMap_matrix; // Shadow map matrix
uniform vec3 viewPosition_WC;  // Uniform for view position
uniform vec3 cameraPosition_WC;  // Uniform for camera position
uniform vec4 shadowMap_camera_positionEC; // Light position in eye coordinates
uniform vec4 shadowMap_camera_directionEC; // Light direction in eye coordinates
uniform vec3 ellipsoidInverseRadii;
uniform vec3 shadowMap_camera_up; // Light up direction
uniform vec3 shadowMap_camera_dir; // Light direction
uniform vec3 shadowMap_camera_right; // Light right direction
uniform vec4 shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness; // Shadow map parameters
uniform vec4 shadowMap_texelSizeDepthBiasAndNormalShadingSmooth; // Shadow map parameters
uniform vec4 _shadowMap_cascadeSplits[2];
uniform mat4 _shadowMap_cascadeMatrices[4];
uniform vec4 _shadowMap_cascadeDistances;
uniform bool exclude_terrain;

in vec2 v_textureCoordinates;
out vec4 FragColor;

vec4 toEye(in vec2 uv, in float depth){
    float x = uv.x * 2.0 - 1.0;
    float y = uv.y * 2.0 - 1.0;
    vec4 camPosition = czm_inverseProjection * vec4(x, y, depth, 1.0);
    float reciprocalW = 1.0 / camPosition.w;
    camPosition *= reciprocalW;
    return camPosition;
}

// This function gets the depth from a depth texture.
float getDepth(in vec4 depth){
    // Unpack the depth value from the depth texture
    float z_window = czm_unpackDepth(depth);
    // Reverse the logarithmic depth value to get the linear depth
    z_window = czm_reverseLogDepth(z_window);
    // Get the near and far values of the depth range
    float n_range = czm_depthRange.near;
    float f_range = czm_depthRange.far;
    // Convert the depth value from window coordinates to normalized device coordinates
    return (2.0 * z_window - n_range - f_range) / (f_range - n_range);
}

/**
 * Projects a point onto a plane.
 *
 * @param planeNormal - A vector representing the normal of the plane.
 * @param planeOrigin - A point on the plane.
 * @param point - The point to be projected onto the plane.
 * @return The projection of the point on the plane.
 */
vec3 pointProjectOnPlane(in vec3 planeNormal, in vec3 planeOrigin, in vec3 point){
    // Calculate the vector from the plane origin to the point
    vec3 v01 = point - planeOrigin;
    
    // Calculate the perpendicular distance from the point to the plane
    float d = dot(planeNormal, v01);
    
    // Subtract the product of the plane normal and d from the point
    // to get the projection of the point on the plane
    return (point - planeNormal * d);
}

/**
 * Calculates the magnitude (length) of a vector.
 *
 * @param pt - The input vector.
 * @return The magnitude of the vector.
 */
float point2mag(vec3 point){
    // Square each component of the vector, add them together,
    // and take the square root of the result
    return sqrt(point.x*point.x + point.y*point.y + point.z*point.z);
}

/**
 * Main function for the fragment shader.
 */
void main() 
{ 
    // Get the color and depth at the current texture coordinates
    vec4 color = texture(colorTexture, v_textureCoordinates);
    vec4 cDepth = texture(depthTexture, v_textureCoordinates);
    
    // Get the depth and position in eye coordinates
    float depth = getDepth(cDepth);
    vec4 positionEC = toEye(v_textureCoordinates, depth);

    // If the depth is at its maximum value, set the fragment color to the texture color and return
    if(cDepth.r >= 1.0){
        FragColor = color;
        return;
    }

    //check to see if we are within distance of the view target
    float cameraDistance = length(cameraPosition_WC.xyz - viewPosition_WC.xyz);

    // Get the fragment position in world coordinates
    vec4 fragPosition_WC = vec4(v_textureCoordinates, 0.0, 1.0);

    if (
        cDepth.r >= 1.0 ||
        (exclude_terrain && czm_ellipsoidContainsPoint(ellipsoidInverseRadii, positionEC.xyz))
        ){
        FragColor = color;
        return;
    }
    
    // Initialize shadow parameters
    czm_shadowParameters shadowParameters; 
    shadowParameters.texelStepSize = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.xy; 
    shadowParameters.depthBias = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.z; 
    shadowParameters.normalShadingSmooth = shadowMap_texelSizeDepthBiasAndNormalShadingSmooth.w; 
    shadowParameters.darkness = shadowMap_normalOffsetScaleDistanceMaxDistanceAndDarkness.w; 

    // Adjust the depth bias
    shadowParameters.depthBias *= max(depth * 0.01, 1.0); 

    // Calculate the direction in eye coordinates
    vec3 directionEC = normalize(positionEC.xyz - shadowMap_camera_positionEC.xyz); 

    // Calculate the dot product of the normal and the negative direction
   float nDotL = clamp(dot(vec3(1.0), -directionEC), 0.0, 1.0); 

    // Calculate the shadow position
    vec4 shadowPosition = shadowMap_matrix * positionEC; 
    shadowPosition /= shadowPosition.w; 

    // If the shadow position is outside the [0, 1] range in any dimension, set the fragment color to the texture color and return
    if (any(lessThan(shadowPosition.xyz, vec3(0.0))) || any(greaterThan(shadowPosition.xyz, vec3(1.0)))) 
    { 
        FragColor = color;
        return;
    }

    // If the distance between the coordinates and the viewpoint is greater than the maximum distance, the shadow effect is discarded
    vec4 lw = czm_inverseView*  vec4(shadowMap_camera_positionEC.xyz, 1.0);
    vec4 vw = czm_inverseView* vec4(positionEC.xyz, 1.0);
    
    if(distance(lw.xyz,vw.xyz)>view_distance){
        FragColor = color;
        return;
    }
    
    // Set the shadow parameters
    shadowParameters.texCoords = shadowPosition.xy; 
    shadowParameters.depth = shadowPosition.z; 
    shadowParameters.nDotL = nDotL; 

    // Calculate the shadow visibility
    float visibility = czm_shadowVisibility(shadowMap, shadowParameters); 

    // If the visibility is 1.0, mix the color with the visible color
    if(visibility==1.0){
        FragColor = mix(texture(colorTexture, v_textureCoordinates),vec4(viewArea_color,1.0),percentShade);
    }else{
        if(abs(shadowPosition.z-0.0)<0.01){
            FragColor = color;
            return;
        }
        FragColor = mix(texture(colorTexture, v_textureCoordinates),vec4(shadowArea_color,1.0),percentShade);
    }
}`;