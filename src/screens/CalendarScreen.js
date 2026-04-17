import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity,  ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOS } from '../context/OSContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function CalendarScreen({ navigation }) {
  const { osType } = useOS();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const daysOfWeek = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const numDays = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
  
  const daysArray = Array.from({ length: numDays }, (_, i) => i + 1);
  const blanksArray = Array.from({ length: firstDay }, (_, i) => i);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };
  
  const handleNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === currentMonth && today.getFullYear() === currentYear;
  };

  const isSelected = (day) => {
    return selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
  };

  const handleDayPress = (day) => {
    setSelectedDate(new Date(currentYear, currentMonth, day));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={28} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.monthSelector}>
          <TouchableOpacity onPress={handlePrevMonth} style={styles.monthBtn}>
            <Ionicons name="chevron-back" size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{monthNames[currentMonth]} {currentYear}</Text>
          <TouchableOpacity onPress={handleNextMonth} style={styles.monthBtn}>
            <Ionicons name="chevron-forward" size={24} color="#0f172a" />
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => setCurrentDate(new Date())}>
          <Ionicons name="today-outline" size={24} color="#0f172a" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={['#0f172a', '#13213e', '#1d4ed8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.calendarCard}
        >
          <View style={styles.weekRow}>
            {daysOfWeek.map((day, index) => (
              <Text key={index} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {blanksArray.map((_, index) => (
              <View key={`blank-${index}`} style={styles.dayCell} />
            ))}
            {daysArray.map((day) => {
              const current = isToday(day);
              const selected = isSelected(day);
              return (
                <TouchableOpacity 
                  key={day} 
                  style={[styles.dayCell, current && styles.currentDayCell, selected && !current && styles.selectedDayCell]}
                  onPress={() => handleDayPress(day)}
                >
                  <Text style={[styles.dayText, current && styles.currentDayText, selected && !current && styles.selectedDayText]}>
                    {day}
                  </Text>
                  {/* Mock event dot for 14th of the month */}
                  {day === 14 && <View style={[styles.eventDotIndicator, current && styles.currentEventDot]} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </LinearGradient>

        <View style={styles.eventsSection}>
          <Text style={styles.eventsHeader}>TODAY'S EVENTS</Text>
          
          <View style={styles.eventCard}>
            <View style={styles.eventDot} />
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>Project Review</Text>
              <Text style={styles.eventTime}>10:00 AM - 11:30 AM</Text>
            </View>
          </View>
          
          <View style={styles.eventCard}>
            <View style={[styles.eventDot, { backgroundColor: '#ec4899' }]} />
            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle}>Lunch with Client</Text>
              <Text style={styles.eventTime}>12:30 PM - 1:30 PM</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation Bar */}
      {osType !== 'ios' && (
        <View style={styles.bottomNav}>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('RecentAppsScreen')}>
                  <Ionicons name="menu" size={24} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.navigate('DesktopScreen')}>
                  <Ionicons name="radio-button-off" size={24} color="#64748b" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.navBtn} onPress={() => navigation.goBack()}>
                  <Ionicons name="chevron-back" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backBtn: {
    padding: 4,
  },
  searchBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0f172a',
    minWidth: 150,
    textAlign: 'center',
  },
  monthSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBtn: {
    padding: 8,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  calendarCard: {
    borderRadius: 32,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  weekDayText: {
    width: '14.28%',
    textAlign: 'center',
    color: 'rgba(219,234,254,0.7)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
  },
  currentDayCell: {
    backgroundColor: '#38bdf8',
  },
  dayText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
  },
  currentDayText: {
    color: '#0f172a',
    fontWeight: 'bold',
  },
  selectedDayCell: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  selectedDayText: {
    color: '#38bdf8',
    fontWeight: 'bold',
  },
  eventDotIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ec4899',
    position: 'absolute',
    bottom: 6,
  },
  currentEventDot: {
    backgroundColor: '#0f172a',
  },
  eventsSection: {
    paddingHorizontal: 4,
  },
  eventsHeader: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    color: '#64748b',
    marginBottom: 16,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 24,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#94a3b8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  eventDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    marginRight: 16,
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  eventTime: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});