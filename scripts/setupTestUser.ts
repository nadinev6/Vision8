import { signUp } from '../lib/auth';
import { uploadVideo } from '../lib/storage';
import { createChatSession, addMessageToSession } from '../lib/firebaseHistory';

// Test user configuration
const TEST_USER = {
  name: 'Test User',
  email: 'test@vision8.com',
  password: 'testpassword123'
};

// Sample chat messages for the test user
const SAMPLE_MESSAGES = [
  {
    role: 'user' as const,
    content: 'Can you analyze this video for me?'
  },
  {
    role: 'assistant' as const,
    content: {
      text: 'I can see this is a sample video. The video shows [0:15] a person walking through a park, and at [0:30] there are birds flying in the background. Would you like me to analyze any specific aspects?'
    }
  },
  {
    role: 'user' as const,
    content: 'Tell me more about the scene at 0:30'
  },
  {
    role: 'assistant' as const,
    content: {
      text: 'At [0:30], the scene shows several birds taking flight from the trees. The lighting suggests it\'s during golden hour, creating a warm, cinematic atmosphere. The birds appear to be sparrows or similar small songbirds.'
    }
  }
];

export const setupTestUser = async (videoFile?: File) => {
  try {
    console.log('🔥 Setting up Firebase test user...');
    
    // 1. Create the test user account
    console.log('👤 Creating user account...');
    const user = await signUp(TEST_USER.name, TEST_USER.email, TEST_USER.password);
    console.log('✅ User created:', user.uid);

    // 2. Upload video if provided
    let videoUrl: string | undefined;
    let videoName: string | undefined;
    
    if (videoFile) {
      console.log('📹 Uploading test video...');
      videoUrl = await uploadVideo(videoFile, user.uid, 'test_video.mp4');
      videoName = videoFile.name;
      console.log('✅ Video uploaded:', videoUrl);
    }

    // 3. Create a sample chat session
    console.log('💬 Creating sample chat session...');
    const sessionId = await createChatSession(
      user.uid, 
      'Sample Video Analysis',
      videoUrl,
      videoName
    );
    console.log('✅ Chat session created:', sessionId);

    // 4. Add sample messages to the chat session
    console.log('📝 Adding sample messages...');
    for (const message of SAMPLE_MESSAGES) {
      await addMessageToSession(sessionId, message);
    }
    console.log('✅ Sample messages added');

    console.log('🎉 Test user setup complete!');
    console.log('📧 Email:', TEST_USER.email);
    console.log('🔑 Password:', TEST_USER.password);
    console.log('🆔 User ID:', user.uid);
    
    return {
      user,
      sessionId,
      videoUrl
    };

  } catch (error) {
    console.error('❌ Error setting up test user:', error);
    throw error;
  }
};

// Export test user credentials for easy access
export const TEST_USER_CREDENTIALS = TEST_USER;