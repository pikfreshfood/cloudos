import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

const cloudOsLogo = require('../../assets/cloud-os-logo.png');
const TERMS_SECTIONS = [
  {
    title: 'Platform use',
    body: 'Use Cloud OS only for lawful, respectful, and authorized activity. You are responsible for protecting your account, device number, private files, and any activity linked to your account.',
  },
  {
    title: 'Developer submissions',
    body: 'Developers are responsible for the apps they submit, including permissions, content, external links, icons, screenshots, updates, data handling, and compliance with applicable laws and platform requirements.',
  },
  {
    title: 'Service changes',
    body: 'Cloud OS may update features, review flows, storage behavior, access rules, security checks, and availability as the platform grows. Continued use of the service means you accept the revised platform experience.',
  },
  {
    title: 'Account and file responsibility',
    body: 'Keep backups of important files and do not upload content you do not have the right to store or share. Cloud OS may restrict activity that harms users, devices, infrastructure, or platform integrity.',
  },
];

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isAuthenticated, isHydrated, register } = useAuth();

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      navigation.replace('DashboardScreen');
    }
  }, [isAuthenticated, isHydrated, navigation]);

  const handleRegister = async () => {
    if (password.trim() !== confirmPassword.trim()) {
      alert("Passwords don't match");
      return;
    }

    if (!/^\d{3,20}$/.test(phoneNumber)) {
      alert('Enter a valid phone number with 3 to 20 digits.');
      return;
    }

    if (!acceptedTerms) {
      alert('Please accept the Terms and Conditions before signing up.');
      return;
    }
    
    setIsLoading(true);
    const result = await register({ name, email, phoneNumber, password });
    setIsLoading(false);

    if (result.ok) {
      navigation.replace('DashboardScreen');
      return;
    }

    alert(result.error);
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e293b']}
        style={styles.background}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                <Ionicons name="arrow-back" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            <View style={styles.logoContainer}>
              <Image source={cloudOsLogo} style={styles.logoImage} resizeMode="contain" />
              <Text style={styles.appName}>Create Account</Text>
              <Text style={styles.subtitle}>Use your real phone number for contacts and account recovery</Text>
            </View>

            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Ionicons name="person-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Full Name"
                  placeholderTextColor="#64748b"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Ionicons name="mail-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Email Address"
                  placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                value={email}
                onChangeText={setEmail}
              />
              </View>

              <View style={styles.inputGroup}>
                <Ionicons name="phone-portrait-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Phone Number"
                  placeholderTextColor="#64748b"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={(value) => setPhoneNumber(value.replace(/\D+/g, '').slice(0, 15))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setIsPasswordVisible((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.inputGroup}>
                <Ionicons name="lock-closed-outline" size={20} color="#94a3b8" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="#64748b"
                  secureTextEntry={!isConfirmPasswordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setIsConfirmPasswordVisible((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={isConfirmPasswordVisible ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={isConfirmPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.termsRow} onPress={() => setAcceptedTerms((value) => !value)}>
                <Ionicons
                  name={acceptedTerms ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={acceptedTerms ? '#38bdf8' : '#94a3b8'}
                  style={styles.termsIcon}
                />
                <Text style={styles.termsText}>
                  I accept the{' '}
                  <Text style={styles.termsLink} onPress={() => setTermsVisible(true)}>
                    Terms and Conditions
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.registerBtn}
                onPress={handleRegister}
                disabled={isLoading || !name.trim() || !email.trim() || !phoneNumber || !password.trim() || !confirmPassword.trim() || !acceptedTerms}
              >
                <LinearGradient
                  colors={['#3b82f6', '#2563eb']}
                  style={styles.registerBtnGradient}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.registerBtnText}>Sign Up</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('LoginScreen')}>
                  <Text style={styles.loginLink}>Log In</Text>
                </TouchableOpacity>
              </View>
            </View>

          </ScrollView>

        </KeyboardAvoidingView>
      </LinearGradient>
      <Modal visible={termsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.termsModal}>
            <Text style={styles.termsModalTitle}>Terms and Conditions</Text>
            <ScrollView style={styles.termsModalBody}>
              {TERMS_SECTIONS.map((section) => (
                <View key={section.title} style={styles.termSection}>
                  <Text style={styles.termSectionTitle}>{section.title}</Text>
                  <Text style={styles.termSectionBody}>{section.body}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.termsModalActions}>
              <TouchableOpacity style={styles.termsCloseBtn} onPress={() => setTermsVisible(false)}>
                <Text style={styles.termsCloseText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.termsAcceptBtn}
                onPress={() => {
                  setAcceptedTerms(true);
                  setTermsVisible(false);
                }}
              >
                <Text style={styles.termsAcceptText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
  },
  backBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 40,
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
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 56,
    color: '#0f172a',
    fontSize: 16,
  },
  passwordToggle: {
    width: 40,
    height: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  registerBtn: {
    height: 56,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    marginTop: 12,
  },
  registerBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  registerBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  loginLink: {
    color: '#38bdf8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 2,
    marginBottom: 8,
  },
  termsIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  termsText: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  termsLink: {
    color: '#38bdf8',
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,7,19,0.76)',
    justifyContent: 'center',
    padding: 22,
  },
  termsModal: {
    maxHeight: '82%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  termsModalTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 14,
  },
  termsModalBody: {
    maxHeight: 420,
  },
  termSection: {
    marginBottom: 16,
  },
  termSectionTitle: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 6,
  },
  termSectionBody: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 21,
  },
  termsModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 18,
  },
  termsCloseBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  termsCloseText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '800',
  },
  termsAcceptBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  termsAcceptText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
});
