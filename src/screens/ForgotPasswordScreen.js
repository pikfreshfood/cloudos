import React, { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { authService } from '../services/api';

const cloudOsLogo = require('../../assets/cloud-os-logo.png');

export default function ForgotPasswordScreen({ navigation, route }) {
  const [email, setEmail] = useState(route?.params?.email || '');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSendResetLink = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      alert('Enter your registered email address.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const response = await authService.forgotPassword({ email: normalizedEmail });
      setMessage(response.message || 'Password reset link sent. Check your email inbox.');
    } catch (error) {
      const serverMessage = error?.response?.data?.message || 'Unable to send password reset link.';
      alert(serverMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.background}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>

          <View style={styles.logoContainer}>
            <Image source={cloudOsLogo} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.appName}>Forgot Password</Text>
            <Text style={styles.subtitle}>Enter your registered email and we will send a secure reset link.</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email Address"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {!!message && <Text style={styles.successText}>{message}</Text>}

            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleSendResetLink}
              disabled={isLoading || !email}
            >
              <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.resetBtnGradient}>
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.resetBtnText}>Send Reset Link</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => navigation.navigate('LoginScreen')} style={styles.loginLinkWrap}>
              <Text style={styles.loginLink}>Back to login</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { flex: 1 },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 88,
  },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 24,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 42,
  },
  logoImage: {
    width: 190,
    height: 118,
    marginBottom: 10,
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputIcon: { marginRight: 12 },
  input: {
    flex: 1,
    height: 56,
    color: '#0f172a',
    fontSize: 16,
  },
  successText: {
    color: '#86efac',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginBottom: 16,
  },
  resetBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
  },
  resetBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  loginLinkWrap: {
    alignItems: 'center',
  },
  loginLink: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
