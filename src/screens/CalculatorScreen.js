import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOS } from '../context/OSContext';

const BUTTONS = [
  ['C', '±', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '=']
];

export default function CalculatorScreen({ navigation }) {
  const { osType } = useOS();
  const [display, setDisplay] = useState('0');
  const [expression, setExpression] = useState('');
  const [previousValue, setPreviousValue] = useState(null);
  const [operator, setOperator] = useState(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);

  const calculate = (a, b, op) => {
    const numA = parseFloat(a);
    const numB = parseFloat(b);
    if (isNaN(numA) || isNaN(numB)) return String(b);
    
    let result = 0;
    switch (op) {
      case '+': result = numA + numB; break;
      case '-': result = numA - numB; break;
      case '×': result = numA * numB; break;
      case '÷': result = numA / numB; break;
    }
    // Handle floating point precision issues simply
    return String(Math.round(result * 100000000) / 100000000);
  };

  const syncExpressionWithValue = (nextValue) => {
    if (operator && previousValue !== null) {
      setExpression(`${previousValue} ${operator} ${nextValue}`);
      return;
    }

    setExpression(nextValue);
  };

  const handlePress = (btn) => {
    if (btn === 'C') {
      setDisplay('0');
      setExpression('');
      setPreviousValue(null);
      setOperator(null);
      setWaitingForNewValue(false);
      return;
    }

    if (btn === '±') {
      const nextValue = String(parseFloat(display) * -1);
      setDisplay(nextValue);
      syncExpressionWithValue(nextValue);
      return;
    }

    if (btn === '%') {
      const nextValue = String(parseFloat(display) / 100);
      setDisplay(nextValue);
      syncExpressionWithValue(nextValue);
      return;
    }

    if (['÷', '×', '-', '+'].includes(btn)) {
      if (operator && !waitingForNewValue) {
        const result = calculate(previousValue, display, operator);
        setDisplay(result);
        setPreviousValue(result);
        setExpression(`${result} ${btn}`);
      } else {
        setPreviousValue(display);
        setExpression(`${display} ${btn}`);
      }
      setOperator(btn);
      setWaitingForNewValue(true);
      return;
    }

    if (btn === '=') {
      if (operator && previousValue) {
        const result = calculate(previousValue, display, operator);
        setDisplay(result);
        setExpression('');
        setPreviousValue(null);
        setOperator(null);
        setWaitingForNewValue(true);
      }
      return;
    }

    if (btn === '.') {
      if (waitingForNewValue) {
        setDisplay('0.');
        syncExpressionWithValue('0.');
        setWaitingForNewValue(false);
      } else if (!display.includes('.')) {
        const nextValue = display + '.';
        setDisplay(nextValue);
        syncExpressionWithValue(nextValue);
      }
      return;
    }
    
    // Numbers
    if (waitingForNewValue) {
      setDisplay(btn);
      syncExpressionWithValue(btn);
      setWaitingForNewValue(false);
    } else {
      const nextValue = display === '0' ? btn : display + btn;
      setDisplay(nextValue);
      syncExpressionWithValue(nextValue);
    }
  };

  const getButtonStyle = (btn) => {
    if (['÷', '×', '-', '+', '='].includes(btn)) {
      return [styles.button, styles.operatorButton];
    }
    if (['C', '±', '%'].includes(btn)) {
      return [styles.button, styles.actionButton];
    }
    if (btn === '0') {
      return [styles.button, styles.zeroButton];
    }
    return styles.button;
  };

  const getButtonTextStyle = (btn) => {
    if (['C', '±', '%'].includes(btn)) {
      return [styles.buttonText, styles.actionButtonText];
    }
    if (['÷', '×', '-', '+', '='].includes(btn)) {
      return [styles.buttonText, styles.operatorButtonText];
    }
    return styles.buttonText;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={28} color="#ffffff" />
        </TouchableOpacity>
      </View>

      <View style={styles.displayContainer}>
        <Text style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>
          {expression || display}
        </Text>
      </View>

      <View style={styles.keypad}>
        {BUTTONS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((btn) => (
              <TouchableOpacity 
                key={btn} 
                style={getButtonStyle(btn)}
                onPress={() => handlePress(btn)}
                activeOpacity={0.7}
              >
                <Text style={getButtonTextStyle(btn)}>{btn}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

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
    backgroundColor: '#000000',
  },
  header: {
    padding: 15,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 30,
    paddingBottom: 20,
  },
  displayText: {
    fontSize: 80,
    fontWeight: '300',
    color: '#ffffff',
  },
  keypad: {
    paddingBottom: 30,
    paddingHorizontal: 15,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  button: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    backgroundColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zeroButton: {
    width: 165,
    alignItems: 'flex-start',
    paddingLeft: 30,
  },
  operatorButton: {
    backgroundColor: '#ff9f0a',
  },
  actionButton: {
    backgroundColor: '#a5a5a5',
  },
  buttonText: {
    fontSize: 32,
    fontWeight: '400',
    color: '#ffffff',
  },
  operatorButtonText: {
    color: '#ffffff',
    fontWeight: '500',
  },
  actionButtonText: {
    color: '#000000',
    fontWeight: '500',
  },
  bottomNav: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingBottom: 8,
  },
  navBtn: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
